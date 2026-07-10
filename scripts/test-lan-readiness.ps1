[CmdletBinding()]
param([ValidateRange(1, 65535)][int]$Port = 3000)

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$database = Resolve-SmartConstructionDatabase
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$health = $null
try { $health = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $Port + "/api/health") -TimeoutSec 5 } catch {}
$addresses = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object InterfaceAlias, IPAddress, PrefixLength
$healthStatus = if ($health) { $health.status } else { "unreachable" }
$result = [pscustomobject]@{
    Ready = [bool]$listener -and $healthStatus -eq "ok" -and (Test-Path -LiteralPath $database)
    PortListening = [bool]$listener
    ProcessId = if ($listener) { $listener.OwningProcess } else { $null }
    Health = $healthStatus
    Database = $database
    DatabaseExists = Test-Path -LiteralPath $database
    LanAddresses = $addresses
    TeamUrls = @($addresses | ForEach-Object { "http://" + $_.IPAddress + ":" + $Port })
}
$result
if (-not $result.Ready) { exit 1 }
