@echo off
REM Convenience wrapper for apitester-app: builds the frontend (apitester-ui), syncs it into
REM apitester-app\src\main\resources\static, stops any running instance on port 8082, does a
REM clean Java-only rebuild, and starts it again. Safe to run anytime — apitester-app's data
REM lives in apitester-app\apitester-data (outside target\), so a clean build never touches it.
REM Run from cmd.exe or PowerShell: mvnwapitest.cmd
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo === Building frontend (apitester-ui) ===
pushd apitester-ui
call npm run build
if errorlevel 1 (
    echo.
    echo FRONTEND BUILD FAILED.
    popd
    exit /b 1
)
popd

echo === Syncing frontend build into apitester-app\src\main\resources\static ===
if exist apitester-app\src\main\resources\static\assets rmdir /s /q apitester-app\src\main\resources\static\assets
if exist apitester-app\src\main\resources\static\index.html del /q apitester-app\src\main\resources\static\index.html
xcopy /s /e /y apitester-ui\dist\* apitester-app\src\main\resources\static\ >nul

echo === Stopping any apitester-app already running on port 8082 ===
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8082" ^| findstr "LISTENING"') do (
    echo Stopping PID %%p...
    taskkill /F /PID %%p >nul 2>&1
)

echo === Building apitester-app (clean package, skip tests, Java only) ===
call mvnw.cmd -pl apitester-app -am clean package -DskipTests
if errorlevel 1 (
    echo.
    echo BUILD FAILED.
    exit /b 1
)

echo === Starting apitester-app ===
cd apitester-app
start "apitester-app" /min cmd /c "java -jar target\apitester-app-0.0.1-SNAPSHOT.jar > apitester-app.log 2>&1"

echo.
echo Started. Logs: apitester-app\apitester-app.log
echo App:    http://localhost:8082
endlocal
