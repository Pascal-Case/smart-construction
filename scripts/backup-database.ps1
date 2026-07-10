[CmdletBinding()]
param([string]$DatabasePath, [string]$BackupDirectory, [string]$SqliteExe, [ValidateRange(0, 3650)][int]$RetentionDays = 30)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$root = Get-SmartConstructionRoot
$database = Resolve-SmartConstructionDatabase -DatabasePath $DatabasePath
if (-not (Test-Path -LiteralPath $database)) { throw "백업할 DB가 없습니다: $database" }
$sqlite = Resolve-SqliteExecutable -SqliteExe $SqliteExe
$backupRoot = if ($BackupDirectory) { [IO.Path]::GetFullPath($BackupDirectory, $root) } else { Join-Path $root "data\backups" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$target = Join-Path $backupRoot ("smart-construction-" + $timestamp + ".db")
$temporary = $target + ".tmp"
$sqliteTarget = $temporary.Replace("\", "/").Replace("'", "''")
try {
    & $sqlite $database ".timeout 10000" (".backup '" + $sqliteTarget + "'")
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary)) { throw "SQLite online backup 명령이 실패했습니다." }
    Invoke-SqliteQuickCheck -SqliteExe $sqlite -DatabasePath $temporary
    Move-Item -LiteralPath $temporary -Destination $target
    $metadata = [ordered]@{
        format = "smart-construction-backup-v1"
        createdAt = (Get-Date).ToString("o")
        sourceDatabase = $database
        backupFile = $target
        sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        size = (Get-Item -LiteralPath $target).Length
        quickCheck = "ok"
    }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath ($target + ".json") -Encoding utf8
    if ($RetentionDays -gt 0) {
        $threshold = (Get-Date).AddDays(-$RetentionDays)
        Get-ChildItem -LiteralPath $backupRoot -File | Where-Object {
            $_.LastWriteTime -lt $threshold -and ($_.Name -like "smart-construction-*.db" -or $_.Name -like "smart-construction-*.db.json")
        } | Remove-Item -Force
    }
    [pscustomobject]@{ Success = $true; BackupFile = $target; Sha256 = $metadata.sha256; Size = $metadata.size; QuickCheck = "ok" }
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
