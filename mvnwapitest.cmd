@echo off
REM Convenience wrapper for apitester-ui: builds the frontend and syncs it into
REM C:\batchmate\front\dist, which is the resourceBasePath apitester-mule's own
REM api-router-bindingsFlow (collections-api.xml) serves the UI from. Does NOT build, sync, or
REM start apitester-app (Spring Boot) — this repo now runs apitester-mule as the backend
REM instead, so launching the Java app here would just fight it for port 8082.
REM Run from cmd.exe or PowerShell: mvnwapitest.cmd
setlocal
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

echo === Syncing frontend build into C:\batchmate\front\dist (apitester-mule's static resource path) ===
if not exist C:\batchmate\front\dist mkdir C:\batchmate\front\dist
if exist C:\batchmate\front\dist\assets rmdir /s /q C:\batchmate\front\dist\assets
if exist C:\batchmate\front\dist\index.html del /q C:\batchmate\front\dist\index.html
xcopy /s /e /y apitester-ui\dist\* C:\batchmate\front\dist\ >nul

echo.
echo Done. apitester-mule will serve the new build on next request (no restart needed).
echo Open it at: http://localhost:8082/ui/  (served under /ui/*, not the root - see collections-api.xml)
endlocal
