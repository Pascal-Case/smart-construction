[CmdletBinding()]
param([string]$RuleName = "SmartConstruction-LAN", [ValidateRange(1, 65535)][int]$Port = 3000, [string]$RemoteAddress = "LocalSubnet", [switch]$Apply)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$plan = [ordered]@{ Apply = [bool]$Apply; RuleName = $RuleName; Direction = "Inbound"; Protocol = "TCP"; LocalPort = $Port; RemoteAddress = $RemoteAddress; Profile = "Domain,Private"; PublicProfile = "Blocked" }
if (-not $Apply) {
    $plan
    Write-Host "Dry-run입니다. 사내 subnet을 확인한 뒤 관리자 PowerShell에서 -Apply를 지정하세요."
    return
}
if (-not (Test-SmartConstructionAdministrator)) { throw "방화벽 변경은 관리자 PowerShell에서 실행해 주세요." }
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Set-NetFirewallRule -DisplayName $RuleName -Enabled True -Direction Inbound -Action Allow -Profile Domain,Private | Out-Null
    Set-NetFirewallPortFilter -AssociatedNetFirewallRule $existing -Protocol TCP -LocalPort $Port | Out-Null
    Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $existing -RemoteAddress $RemoteAddress | Out-Null
} else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress $RemoteAddress -Profile Domain,Private | Out-Null
}
[pscustomobject]@{ Applied = $true; RuleName = $RuleName; Port = $Port; RemoteAddress = $RemoteAddress }
