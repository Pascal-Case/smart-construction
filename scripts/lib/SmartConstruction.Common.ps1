Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SmartConstructionRoot {
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
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
    if ($DatabasePath) { return [IO.Path]::GetFullPath($DatabasePath, $root) }
    $url = Get-SmartConstructionEnvValue -Name "DATABASE_URL"
    if (-not $url.StartsWith("file:")) { throw "DATABASE_URL은 SQLite file: URL이어야 합니다." }
    $configured = $url.Substring(5)
    if ([IO.Path]::IsPathRooted($configured)) { return [IO.Path]::GetFullPath($configured) }
    return [IO.Path]::GetFullPath((Join-Path $root $configured))
}

function Resolve-SqliteExecutable {
    param([string]$SqliteExe)
    $candidates = @()
    if ($SqliteExe) { $candidates += $SqliteExe }
    $command = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    $candidates += "D:\SQLite\sqlite3.exe"
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return [IO.Path]::GetFullPath($candidate) } }
    throw "sqlite3.exe를 찾지 못했습니다. -SqliteExe 또는 D:\SQLite\sqlite3.exe를 확인해 주세요."
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

function Invoke-SqliteQuickCheck {
    param([Parameter(Mandatory)][string]$SqliteExe, [Parameter(Mandatory)][string]$DatabasePath)
    $result = & $SqliteExe $DatabasePath "PRAGMA quick_check;"
    if ($LASTEXITCODE -ne 0 -or ($result | Select-Object -Last 1) -ne "ok") { throw ("SQLite quick_check 실패: " + $DatabasePath + " / " + ($result -join [Environment]::NewLine)) }
}
