@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 스마트 건설안전 - 서버 종료

echo ========================================
echo  스마트 건설안전 서버를 종료합니다.
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-production.ps1" -Port 3000
if errorlevel 1 goto :failed

echo.
echo 서버 종료 처리가 완료되었습니다.
pause
exit /b 0

:failed
echo.
echo 서버를 종료하지 못했습니다. 위 오류 내용을 관리자에게 전달하세요.
pause
exit /b 1
