[CmdletBinding()]
param([ValidateRange(1, 65535)][int]$Port = 3000, [switch]$Force)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    [pscustomobject]@{ Stopped = $true; Port = $Port; ProcessId = $null; Message = "리스너가 없어 이미 중지된 상태입니다." }
    return
}

$process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$listener.OwningProcess)
if (-not $process -or $process.Name -ne "node.exe" -or $process.CommandLine -notlike "*smart-construction*" -or $process.CommandLine -notlike "*next*dist*bin*next*start*") {
    throw "$Port 포트 프로세스가 smart-construction production server가 아니어서 중지하지 않습니다. PID $($listener.OwningProcess) / $($process.CommandLine)"
}

Stop-Process -Id $listener.OwningProcess -Force:$Force
$deadline = (Get-Date).AddSeconds(10)
do {
    Start-Sleep -Milliseconds 250
    $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
} while ($remaining -and (Get-Date) -lt $deadline)

if ($remaining) { throw "$Port 포트의 production server가 종료되지 않았습니다. 필요하면 -Force를 사용해 주세요." }
[pscustomobject]@{ Stopped = $true; Port = $Port; ProcessId = $listener.OwningProcess; Message = "smart-construction production server를 중지했습니다." }
