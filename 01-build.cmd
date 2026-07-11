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

echo [1/5] 프로그램 구성요소를 설치합니다.
call npm.cmd ci
if errorlevel 1 goto :failed

echo.
echo [2/5] 환경설정을 확인합니다.
call npm.cmd run env:check
if errorlevel 1 goto :failed

echo.
echo [3/5] 데이터베이스 코드를 생성합니다.
call npm.cmd run db:generate
if errorlevel 1 goto :failed

echo.
echo [4/5] 데이터베이스를 준비합니다.
call npm.cmd run db:deploy
if errorlevel 1 goto :failed

echo.
echo [5/5] 운영용 프로그램을 빌드합니다.
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
