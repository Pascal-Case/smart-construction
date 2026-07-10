[CmdletBinding()]
param([string]$AppTaskName = "SmartConstruction-App", [string]$BackupTaskName = "SmartConstruction-Backup", [ValidateRange(1, 65535)][int]$Port = 3000, [string]$NodeExe, [string]$BackupTime = "02:00", [string]$BackupDirectory, [switch]$Apply)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$root = Get-SmartConstructionRoot
$node = if ($NodeExe) { [IO.Path]::GetFullPath($NodeExe) } else { (Get-Command node.exe -ErrorAction Stop).Source }
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startScript = Join-Path $PSScriptRoot "start-production.ps1"
$backupScript = Join-Path $PSScriptRoot "backup-database.ps1"
$appArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $startScript + '" -NodeExe "' + $node + '" -Port ' + $Port
$resolvedBackupDirectory = if ($BackupDirectory) { Resolve-SmartConstructionPath -Path $BackupDirectory -BasePath $root } else { Join-Path $root "data\backups" }
$backupArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $backupScript + '"' + $(if ($BackupDirectory) { ' -BackupDirectory "' + $resolvedBackupDirectory + '"' } else { "" })
$plan = [ordered]@{ Apply = [bool]$Apply; RunAs = "SYSTEM"; AppTask = $AppTaskName; AppTrigger = "Windows startup + 30 seconds"; Port = $Port; NodeExe = $node; BackupTask = $BackupTaskName; BackupTime = $BackupTime; BackupDirectory = $resolvedBackupDirectory; ProjectRoot = $root }
if (-not $Apply) {
    $plan
    Write-Host "Dry-run입니다. 관리자 PowerShell에서 -Apply를 지정해야 작업 스케줄러가 변경됩니다."
    return
}
if (-not (Test-SmartConstructionAdministrator)) { throw "작업 스케줄러 등록은 관리자 PowerShell에서 실행해 주세요." }
$time = [datetime]::ParseExact($BackupTime, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$appAction = New-ScheduledTaskAction -Execute $powerShell -Argument $appArguments -WorkingDirectory $root
$appTrigger = New-ScheduledTaskTrigger -AtStartup
$appTrigger.Delay = "PT30S"
$appTask = New-ScheduledTask -Action $appAction -Trigger $appTrigger -Principal $principal -Settings $settings -Description "스마트 건설안전 Next.js production server"
Register-ScheduledTask -TaskName $AppTaskName -InputObject $appTask -Force | Out-Null
$backupAction = New-ScheduledTaskAction -Execute $powerShell -Argument $backupArguments -WorkingDirectory $root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $time
$backupTask = New-ScheduledTask -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Description "스마트 건설안전 SQLite daily backup"
Register-ScheduledTask -TaskName $BackupTaskName -InputObject $backupTask -Force | Out-Null
[pscustomobject]@{ Applied = $true; AppTask = $AppTaskName; BackupTask = $BackupTaskName; Port = $Port; BackupTime = $BackupTime }
