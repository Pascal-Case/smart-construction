[CmdletBinding()]
param([string]$BackupTaskName = "SmartConstruction-Backup", [string]$BackupTime = "02:00", [string]$BackupDirectory, [switch]$Apply)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$root = Get-SmartConstructionRoot
$legacyAppTaskName = "SmartConstruction-App"
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$backupScript = Join-Path $PSScriptRoot "backup-database.ps1"
$resolvedBackupDirectory = if ($BackupDirectory) { Resolve-SmartConstructionPath -Path $BackupDirectory -BasePath $root } else { Join-Path $root "data\backups" }
$backupArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $backupScript + '"' + $(if ($BackupDirectory) { ' -BackupDirectory "' + $resolvedBackupDirectory + '"' } else { "" })
$plan = [ordered]@{ Apply = [bool]$Apply; RunAs = "SYSTEM"; BackupTask = $BackupTaskName; BackupTime = $BackupTime; BackupDirectory = $resolvedBackupDirectory; LegacyAppTask = $legacyAppTaskName; LegacyAppTaskAction = "Remove if present"; ProjectRoot = $root }
if (-not $Apply) {
    $plan
    Write-Host "Dry-run입니다. 관리자 PowerShell에서 -Apply를 지정해야 작업 스케줄러가 변경됩니다."
    return
}
if (-not (Test-SmartConstructionAdministrator)) { throw "작업 스케줄러 등록은 관리자 PowerShell에서 실행해 주세요." }
$time = [datetime]::ParseExact($BackupTime, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$backupAction = New-ScheduledTaskAction -Execute $powerShell -Argument $backupArguments -WorkingDirectory $root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $time
$backupTask = New-ScheduledTask -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Description "스마트 건설안전 SQLite daily backup"
Register-ScheduledTask -TaskName $BackupTaskName -InputObject $backupTask -Force | Out-Null
$legacyAppTask = Get-ScheduledTask -TaskName $legacyAppTaskName -ErrorAction SilentlyContinue
if ($legacyAppTask) {
    Unregister-ScheduledTask -TaskName $legacyAppTaskName -Confirm:$false
}
[pscustomobject]@{ Applied = $true; BackupTask = $BackupTaskName; BackupTime = $BackupTime; RemovedLegacyAppTask = [bool]$legacyAppTask }
