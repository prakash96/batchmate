@echo off
REM Convenience wrapper for apitester-ui: builds the frontend and syncs it into
REM apitester-mule\src\main\resources\web, which Maven bundles into the ROOT of the deployed
REM app (so it lands at <deployed-app>\web\) — matching api-router-bindingsFlow's
REM resourceBasePath="${mule.home}/apps/${app.name}/web/" in collections-api.xml. (This used to
REM target C:\batchmate\front\dist, from before that resourceBasePath was pointed at the
REM deployed app's own web/ folder instead — that path is no longer read by anything.) Does NOT
REM build, sync, or start apitester-app (Spring Boot) — this repo now runs apitester-mule as the
REM backend instead, so launching the Java app here would just fight it for port 8082.
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

set WEBDIR=%~dp0apitester-mule\src\main\resources\web
echo === Syncing frontend build into %WEBDIR% ===
if not exist "%WEBDIR%" mkdir "%WEBDIR%"
if exist "%WEBDIR%\assets" rmdir /s /q "%WEBDIR%\assets"
if exist "%WEBDIR%\index.html" del /q "%WEBDIR%\index.html"
xcopy /s /e /y apitester-ui\dist\* "%WEBDIR%\" >nul

echo.
echo Done. Redeploy apitester-mule (e.g. from Anypoint Studio) to pick up the new build — this is
echo a source-tree resource, not a live-served path, so it needs an actual redeploy, not just a
echo file swap.
echo Once deployed, open it at: http://localhost:8082/ui/  (served under /ui/*, not the root - see collections-api.xml)
endlocal
