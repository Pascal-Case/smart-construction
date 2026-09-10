Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SmartConstructionRoot {
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
}

function Resolve-SmartConstructionPath {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$BasePath)
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Get-SmartConstructionEnvValue {
    param([Parameter(Mandatory)][string]$Name)
    $root = Get-SmartConstructionRoot
    $envFile = Join-Path $root ".env"
    if (-not (Test-Path -LiteralPath $envFile)) { throw ".env 파일이 없습니다: $envFile" }
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Name) + "\s*=") } | Select-Object -Last 1
    if (-not $line) { throw ".env에 $Name 값이 없습니다." }
    $value = ($line -split "=", 2)[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
    return $value
}

function Resolve-SmartConstructionDatabase {
    param([string]$DatabasePath)
    $root = Get-SmartConstructionRoot
    if ($DatabasePath) { return Resolve-SmartConstructionPath -Path $DatabasePath -BasePath $root }
    $url = Get-SmartConstructionEnvValue -Name "DATABASE_URL"
    if (-not $url.StartsWith("file:")) { throw "DATABASE_URL은 SQLite file: URL이어야 합니다." }
    $configured = $url.Substring(5)
    if ([IO.Path]::IsPathRooted($configured)) { return [IO.Path]::GetFullPath($configured) }
    return [IO.Path]::GetFullPath((Join-Path $root $configured))
}

function Invoke-SqliteMaintenance {
    param(
        [Parameter(Mandatory)][ValidateSet("backup", "verify")][string]$Operation,
        [Parameter(Mandatory)][string]$SourcePath,
        [string]$DestinationPath
    )
    $root = Get-SmartConstructionRoot
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $tsx = Join-Path $root "node_modules\tsx\dist\cli.mjs"
    $script = Join-Path $root "scripts\sqlite-maintenance.ts"
    if (-not (Test-Path -LiteralPath $tsx)) { throw "SQLite 유지관리 실행 파일이 없습니다. npm ci를 먼저 실행해 주세요." }
    $arguments = @($tsx, $script, $Operation, $SourcePath)
    if ($DestinationPath) { $arguments += $DestinationPath }
    & $node @arguments
    if ($LASTEXITCODE -ne 0) { throw "SQLite $Operation 작업이 실패했습니다." }
}

function Test-SmartConstructionAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-SmartConstructionServerStopped {
    param([int]$Port = 3000)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { throw "$Port 포트의 서버 프로세스(PID $($listener.OwningProcess))를 먼저 중지해 주세요." }
}
