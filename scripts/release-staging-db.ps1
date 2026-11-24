# Backs up FamSync's staging data, then applies new migrations. Asks only for the Supabase database password, which is
# never saved or shown. The two app passwords come from .env.hosted-db.local, so the running API keeps its connection.
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ref = 'axzyacocepjelsgqnsky'
$names = 'ADMIN_DATABASE_URL', 'FAMSYNC_API_PASSWORD', 'FAMSYNC_JOBS_PASSWORD', 'PGPASSWORD'
$container = 'famsync-local-database-1'
$plain = $null

function Read-Url($name) {
    $line = Get-Content -LiteralPath (Join-Path $root '.env.hosted-db.local') | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
    if (-not $line) { throw "$name is missing from .env.hosted-db.local." }
    $uri = [Uri]($line.Substring($name.Length + 1).Trim('"'))
    $user, $secret = $uri.UserInfo -split ':', 2
    if (-not $secret) { throw "$name has no password." }
    [pscustomobject]@{ Server = $uri.Host; User = $user; Secret = [Uri]::UnescapeDataString($secret) }
}

try {
    $api = Read-Url 'DATABASE_URL'
    $jobs = Read-Url 'JOBS_DATABASE_URL'
    if ($api.User -ne "famsync_api.$ref" -or $jobs.User -ne "famsync_jobs.$ref" -or $api.Server -notlike '*.pooler.supabase.com') { throw 'The saved settings are not for FamSync staging.' }
    & docker inspect $container --format '{{.State.Status}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Start the local FamSync database first; its pg_dump makes the backup.' }
    if ($CheckOnly) { Write-Host "Ready: $($api.Server), project $ref, both app passwords found."; return }

    $secure = Read-Host 'Supabase database password (staging)' -AsSecureString
    $plain = [System.Net.NetworkCredential]::new('', $secure).Password
    if (-not $plain) { throw 'No password was entered.' }

    Write-Host 'Backing up...'
    & docker cp (Join-Path $root 'apps\api\certs\supabase-ca.crt') "${container}:/tmp/supabase-ca.crt" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The certificate could not be prepared. Nothing was changed.' }
    $env:PGPASSWORD = $plain
    & docker exec -e PGPASSWORD -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/tmp/supabase-ca.crt $container pg_dump -h $api.Server -p 5432 -U "postgres.$ref" -d postgres -n app -n famsync_meta -Fc -f /tmp/staging.dump
    if ($LASTEXITCODE -ne 0) { throw 'The backup failed. Nothing was changed.' }
    $target = Join-Path $root ('output\backups\staging-before-release-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
    & docker cp "${container}:/tmp/staging.dump" $target | Out-Null
    if ($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $target).Length -lt 10000) { throw 'The backup could not be saved. Nothing was changed.' }
    & docker exec $container pg_restore -l /tmp/staging.dump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The backup could not be read back. Nothing was changed.' }
    Write-Host "Backup saved: $target"

    Write-Host 'Applying migrations...'
    $env:ADMIN_DATABASE_URL = "postgresql://postgres.${ref}:$([Uri]::EscapeDataString($plain))@$($api.Server):5432/postgres"
    $env:FAMSYNC_API_PASSWORD = $api.Secret
    $env:FAMSYNC_JOBS_PASSWORD = $jobs.Secret
    & node (Join-Path $PSScriptRoot 'hosted-db-setup.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'The migration stopped. The message above names the file.' }
    Write-Host 'STAGING DATABASE READY'
}
finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    & docker exec $container rm -f /tmp/staging.dump /tmp/supabase-ca.crt 2>$null | Out-Null
    $plain = $secure = $api = $jobs = $null
}
