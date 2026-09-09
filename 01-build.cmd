@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 스마트 건설안전 - 빌드

echo ========================================
echo  스마트 건설안전 설치 및 빌드
echo ========================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto :node_error

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_error

if not exist "package.json" goto :folder_error

if not exist ".env" (
  echo [준비] 환경설정 파일을 생성합니다.
  copy /y ".env.example" ".env" >nul
  if errorlevel 1 goto :failed
)

echo [1/6] 프로그램 구성요소를 설치합니다.
set INSTALL_ATTEMPT=0
:install_dependencies
call npm.cmd ci
if not errorlevel 1 goto :dependencies_installed
set /a INSTALL_ATTEMPT+=1
if %INSTALL_ATTEMPT% GEQ 3 goto :failed
echo.
echo [재시도] 다른 프로그램이 설치 파일을 사용 중일 수 있습니다. 3초 후 다시 시도합니다. (%INSTALL_ATTEMPT%/3)
timeout /t 3 /nobreak >nul
goto :install_dependencies

:dependencies_installed

echo.
echo [2/6] 환경설정을 확인합니다.
call npm.cmd run env:check
if errorlevel 1 goto :failed

echo.
echo [3/6] 데이터베이스 코드를 생성합니다.
call npm.cmd run db:generate
if errorlevel 1 goto :failed

echo.
echo [4/6] 기존 데이터베이스를 백업하고 무결성을 확인합니다.
call npm.cmd run ops:pre-deploy-backup
if errorlevel 1 goto :failed

echo.
echo [5/6] 데이터베이스를 준비합니다.
call npm.cmd run db:deploy
if errorlevel 1 goto :failed

echo.
echo [6/6] 운영용 프로그램을 빌드합니다.
call npm.cmd run build
if errorlevel 1 goto :failed

echo.
echo ========================================
echo  빌드가 완료되었습니다.
echo  이제 02-start-server.cmd를 실행하세요.
echo ========================================
pause
exit /b 0

:node_error
echo [오류] Node.js를 찾을 수 없습니다. Node.js 설치 후 다시 실행하세요.
goto :failed

:npm_error
echo [오류] npm을 찾을 수 없습니다. Node.js를 다시 설치하세요.
goto :failed

:folder_error
echo [오류] 프로젝트 폴더에서 실행해야 합니다.
goto :failed

:failed
echo.
echo 빌드에 실패했습니다. 위 오류 내용을 관리자에게 전달하세요.
pause
exit /b 1
