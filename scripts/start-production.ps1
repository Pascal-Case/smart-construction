[CmdletBinding()]
param([string]$NodeExe, [ValidateRange(1, 65535)][int]$Port = 3000, [string]$HostAddress = "0.0.0.0")

. (Join-Path $PSScriptRoot "lib\SmartConstruction.Common.ps1")
$root = Get-SmartConstructionRoot
Set-Location $root
$node = if ($NodeExe) { [IO.Path]::GetFullPath($NodeExe) } else { (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $node)) { throw "node.exe가 없습니다: $node" }
if (-not (Test-Path -LiteralPath (Join-Path $root ".next\BUILD_ID"))) { throw "production build가 없습니다. npm run build를 먼저 실행해 주세요." }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "$Port 포트를 이미 사용 중입니다." }
$logs = Join-Path $root "data\logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$transcript = Join-Path $logs ("server-" + (Get-Date -Format "yyyyMMdd") + ".log")
Start-Transcript -Path $transcript -Append | Out-Null
try {
    & $node (Join-Path $root "node_modules\prisma\build\index.js") migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "Prisma migration 적용에 실패했습니다." }
    & $node (Join-Path $root "node_modules\next\dist\bin\next") start -H $HostAddress -p $Port
    if ($LASTEXITCODE -ne 0) { throw "Next.js production server가 비정상 종료되었습니다." }
} finally {
    Stop-Transcript | Out-Null
}
