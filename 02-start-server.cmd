@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 스마트 건설안전 - 서버 실행 중

echo ========================================
echo  스마트 건설안전 서버를 실행합니다.
echo  이 창은 서버 사용 중에 닫지 마세요.
echo ========================================
echo.

if not exist ".next\BUILD_ID" goto :build_required

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-production.ps1" -Port 3000
if errorlevel 1 goto :failed

echo.
echo 서버가 종료되었습니다.
pause
exit /b 0

:build_required
echo [오류] 운영용 빌드가 없습니다.
echo 먼저 01-build.cmd를 실행하세요.
goto :failed

:failed
echo.
echo 서버를 실행하지 못했습니다. 위 오류 내용을 관리자에게 전달하세요.
pause
exit /b 1
