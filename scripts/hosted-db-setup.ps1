# Run from any folder. Passwords are prompted privately and never written to disk.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+$')]
    [string]$ProjectRef,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9.-]+\.pooler\.supabase\.com$')]
    [string]$PoolerHost
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
    $databasePassword = Read-DatabaseSecret 'Supabase database password'
    $apiPassword = Read-DatabaseSecret 'API database password (use the one you saved)' 24
    $jobsPassword = Read-DatabaseSecret 'Jobs database password (use the one you saved)' 24

    $encodedPassword = [Uri]::EscapeDataString($databasePassword)
    $env:ADMIN_DATABASE_URL = "postgresql://postgres.${ProjectRef}:${encodedPassword}@${PoolerHost}:5432/postgres"
    $env:FAMSYNC_API_PASSWORD = $apiPassword
    $env:FAMSYNC_JOBS_PASSWORD = $jobsPassword

    Write-Host 'Applying FamSync database migrations...'
    & node (Join-Path $PSScriptRoot 'hosted-db-setup.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw 'Database setup did not finish. Share the error above without passwords or connection strings.'
    }
}
finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    $databasePassword = $apiPassword = $jobsPassword = $encodedPassword = $null
}
