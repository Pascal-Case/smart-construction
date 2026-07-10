[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupFile, [string]$DatabasePath, [string]$SqliteExe, [string]$PreRestoreBackupDirectory, [int]$Port = 3000, [switch]$ConfirmRestore)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
if (-not $ConfirmRestore) { throw "복구는 기존 DB를 교체합니다. 내용을 확인한 뒤 -ConfirmRestore를 지정해 주세요." }
$root = Get-SmartConstructionRoot
$database = Resolve-SmartConstructionDatabase -DatabasePath $DatabasePath
$backup = Resolve-SmartConstructionPath -Path $BackupFile -BasePath $root
if (-not (Test-Path -LiteralPath $backup)) { throw "백업 파일이 없습니다: $backup" }
$sqlite = Resolve-SqliteExecutable -SqliteExe $SqliteExe
Assert-SmartConstructionServerStopped -Port $Port
Invoke-SqliteQuickCheck -SqliteExe $sqlite -DatabasePath $backup
$databaseDirectory = Split-Path -Parent $database
New-Item -ItemType Directory -Path $databaseDirectory -Force | Out-Null
$temporary = Join-Path $databaseDirectory ("restore-" + [guid]::NewGuid().ToString("N") + ".db")
$previous = $database + ".restore-previous"
$sqliteTarget = $temporary.Replace("\", "/").Replace("'", "''")
try {
    & $sqlite $backup (".backup '" + $sqliteTarget + "'")
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary)) { throw "복구용 DB 복제에 실패했습니다." }
    Invoke-SqliteQuickCheck -SqliteExe $sqlite -DatabasePath $temporary
    if (Test-Path -LiteralPath $database) {
        & (Join-Path $PSScriptRoot "backup-database.ps1") -DatabasePath $database -BackupDirectory $PreRestoreBackupDirectory -SqliteExe $sqlite -RetentionDays 30 | Out-Null
    }
    foreach ($sidecar in @($database + "-wal", $database + "-shm")) {
        $resolved = [IO.Path]::GetFullPath($sidecar)
        if (-not $resolved.StartsWith([IO.Path]::GetFullPath($databaseDirectory), [StringComparison]::OrdinalIgnoreCase)) { throw "DB sidecar 경로 검증에 실패했습니다." }
        if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Force }
    }
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force }
    if (Test-Path -LiteralPath $database) { Move-Item -LiteralPath $database -Destination $previous }
    try {
        Move-Item -LiteralPath $temporary -Destination $database
        Invoke-SqliteQuickCheck -SqliteExe $sqlite -DatabasePath $database
        if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force }
    } catch {
        if (Test-Path -LiteralPath $database) { Remove-Item -LiteralPath $database -Force }
        if (Test-Path -LiteralPath $previous) { Move-Item -LiteralPath $previous -Destination $database }
        throw
    }
    [pscustomobject]@{ Success = $true; RestoredFrom = $backup; Database = $database; QuickCheck = "ok" }
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
