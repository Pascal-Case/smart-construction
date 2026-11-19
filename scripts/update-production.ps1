[CmdletBinding()]
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = "Stop"
$exitCode = 0
$branchName = "feature/jinyong"
$branchRef = "refs/heads/$branchName"
$remoteBranch = "origin/$branchName"
$remoteRef = "refs/remotes/$remoteBranch"

try {
    Set-Location ([IO.Path]::GetFullPath($ProjectRoot))

    Write-Host "========================================"
    Write-Host " 스마트 건설안전 최신 코드를 받습니다."
    Write-Host "========================================"
    Write-Host

    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        throw "Git을 찾을 수 없습니다. Git 설치 후 다시 실행하세요."
    }
    if (-not (Test-Path -LiteralPath ".git")) {
        throw "Git으로 받은 프로젝트 폴더에서 실행해야 합니다."
    }
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
        throw "서버가 실행 중입니다. 먼저 03-stop-server.cmd로 서버를 종료하세요."
    }
    $changes = & git status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0) { throw "프로젝트 변경 상태를 확인하지 못했습니다." }
    if ($changes) {
        throw "프로젝트 폴더에 커밋하지 않은 변경 파일이 있습니다. 관리자에게 문의하거나 변경 파일을 정리하세요."
    }

    Write-Host "[1/3] GitHub에서 $remoteBranch 최신 정보를 확인합니다."
    & git fetch --no-tags origin "${branchRef}:$remoteRef"
    if ($LASTEXITCODE -ne 0) { throw "$remoteBranch 최신 정보 확인에 실패했습니다." }

    $currentRef = & git symbolic-ref --quiet HEAD
    if ($LASTEXITCODE -ne 0 -or ($currentRef -cne "refs/heads/main" -and $currentRef -cne $branchRef)) {
        throw "main 또는 $branchName 브랜치에서 업데이트를 실행하세요."
    }

    & git show-ref --verify --quiet $branchRef
    if ($LASTEXITCODE -gt 1) { throw "$branchName 로컬 브랜치를 확인하지 못했습니다." }
    $localBranchExists = $LASTEXITCODE -eq 0

    $localRefsToCheck = @($currentRef)
    if ($currentRef -cne $branchRef -and $localBranchExists) {
        $localRefsToCheck += $branchRef
    }
    foreach ($localRef in $localRefsToCheck) {
        $localBranch = $localRef.Substring("refs/heads/".Length)
        & git merge-base --is-ancestor $localRef $remoteRef
        if ($LASTEXITCODE -eq 1) {
            throw "로컬 $localBranch 브랜치의 일부 커밋이 ${remoteBranch}에 없습니다. 관리자에게 문의하세요."
        }
        if ($LASTEXITCODE -ne 0) { throw "$localBranch 브랜치의 커밋을 확인하지 못했습니다." }
    }

    Write-Host
    Write-Host "[2/3] $branchName 브랜치를 확인합니다."
    if ($currentRef -cne $branchRef) {
        if ($localBranchExists) {
            & git switch --no-guess --no-overwrite-ignore $branchName
        } else {
            & git switch --no-overwrite-ignore --create $branchName $remoteRef
        }
        if ($LASTEXITCODE -ne 0) { throw "$branchName 브랜치로 이동하지 못했습니다." }
    }

    Write-Host
    Write-Host "[3/3] 최신 코드를 적용합니다."
    $activeRef = & git symbolic-ref --quiet HEAD
    if ($LASTEXITCODE -ne 0 -or $activeRef -cne $branchRef) {
        throw "업데이트 중 브랜치가 변경되었습니다. $branchName 브랜치에서 다시 실행하세요."
    }
    & git merge --ff-only --no-overwrite-ignore $remoteRef
    if ($LASTEXITCODE -ne 0) { throw "최신 코드를 적용하지 못했습니다." }

    Write-Host
    Write-Host "현재 코드 버전:"
    & git log -1 --oneline

    Write-Host
    Write-Host "========================================"
    Write-Host " 업데이트가 완료되었습니다."
    Write-Host " 변경된 코드를 사용하려면"
    Write-Host " 01-build.cmd를 실행하세요."
    Write-Host "========================================"
} catch {
    $exitCode = 1
    Write-Host
    Write-Host ("[오류] " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "업데이트에 실패했습니다. 위 오류 내용을 관리자에게 전달하세요."
} finally {
    Write-Host
    Read-Host "Enter 키를 누르면 창이 닫힙니다"
}

exit $exitCode
