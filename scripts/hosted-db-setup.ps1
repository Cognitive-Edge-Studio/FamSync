# Run from any folder. Fresh mode generates application passwords for Render.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+$')]
    [string]$ProjectRef,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9.-]+\.pooler\.supabase\.com$')]
    [string]$PoolerHost,

    [switch]$Fresh
)

$ErrorActionPreference = 'Stop'

function Read-DatabaseSecret {
    param([string]$Prompt, [int]$MinimumLength = 1)
    do {
        $secure = Read-Host $Prompt -AsSecureString
        try {
            $value = [System.Net.NetworkCredential]::new('', $secure).Password
        }
        finally {
            $secure.Dispose()
        }
        if ($value.Length -lt $MinimumLength) {
            Write-Host "Enter at least $MinimumLength characters."
        }
    } while ($value.Length -lt $MinimumLength)
    return $value
}

$previousEnvironment = @{}
foreach ($name in @('ADMIN_DATABASE_URL', 'FAMSYNC_API_PASSWORD', 'FAMSYNC_JOBS_PASSWORD')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    Get-Command node -ErrorAction Stop | Out-Null
    $credentialsFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.hosted-db.local'
    if ($Fresh -and (Test-Path -LiteralPath $credentialsFile)) {
        throw 'Fresh setup stopped: .env.hosted-db.local already exists. Keep its credentials and use the normal setup command to resume.'
    }
    $databasePassword = Read-DatabaseSecret 'Supabase database password'
    if ($Fresh) {
        $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $bytes = New-Object byte[] 32
            $generator.GetBytes($bytes)
            $apiPassword = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
            $generator.GetBytes($bytes)
            $jobsPassword = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        }
        finally {
            $generator.Dispose()
        }
    }
    else {
        $apiPassword = Read-DatabaseSecret 'API database password (use the one you saved)' 24
        $jobsPassword = Read-DatabaseSecret 'Jobs database password (use the one you saved)' 24
    }

    $encodedPassword = [Uri]::EscapeDataString($databasePassword)
    $env:ADMIN_DATABASE_URL = "postgresql://postgres.${ProjectRef}:${encodedPassword}@${PoolerHost}:5432/postgres"
    $env:FAMSYNC_API_PASSWORD = $apiPassword
    $env:FAMSYNC_JOBS_PASSWORD = $jobsPassword

    Write-Host 'Applying FamSync database migrations...'
    $nodeArguments = @((Join-Path $PSScriptRoot 'hosted-db-setup.mjs'))
    if ($Fresh) { $nodeArguments += '--fresh' }
    & node @nodeArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Database setup did not finish. Share the error above without passwords or connection strings.'
    }
    if ($Fresh) {
        $lines = @(
            '# Server-only database connection strings. Do not commit or share.'
            "DATABASE_URL=postgresql://famsync_api.${ProjectRef}:${apiPassword}@${PoolerHost}:5432/postgres?sslmode=verify-full"
            "JOBS_DATABASE_URL=postgresql://famsync_jobs.${ProjectRef}:${jobsPassword}@${PoolerHost}:5432/postgres?sslmode=verify-full"
        )
        # CreateNew prevents replacing credentials if another setup finished first.
        $stream = [System.IO.File]::Open($credentialsFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
        try {
            $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
            try { foreach ($line in $lines) { $writer.WriteLine($line) } }
            finally { $writer.Dispose() }
        }
        finally { $stream.Dispose() }
        Write-Host "Render database settings saved to $credentialsFile"
        Write-Host 'Keep this file private. It contains the two generated application passwords; it does not contain the Supabase admin password.'
    }
}
finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    $databasePassword = $apiPassword = $jobsPassword = $encodedPassword = $null
}
