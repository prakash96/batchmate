@echo off
setlocal EnableDelayedExpansion

REM mvnw.bat - Pure CMD Maven Wrapper (no PowerShell required)
REM Works on Windows 10+ where curl and tar are built-in

set "SCRIPT_DIR=%~dp0"
set "WRAPPER_PROPS=%SCRIPT_DIR%.mvn\wrapper\maven-wrapper.properties"

REM -- 0. Use system Maven if already available in MAVEN_HOME or PATH ----------
if defined MAVEN_HOME (
    if exist "%MAVEN_HOME%\bin\mvn.cmd" (
        set "MVN_CMD=%MAVEN_HOME%\bin\mvn.cmd"
        goto :run
    )
)
if defined M2_HOME (
    if exist "%M2_HOME%\bin\mvn.cmd" (
        set "MVN_CMD=%M2_HOME%\bin\mvn.cmd"
        goto :run
    )
)
for /f "usebackq delims=" %%M in (`where mvn.cmd 2^>nul`) do (
    set "MVN_CMD=%%M"
    goto :run
)

REM -- 1. Read distributionUrl from maven-wrapper.properties --------------------
set "DIST_URL="
for /f "usebackq tokens=1,* delims==" %%A in ("%WRAPPER_PROPS%") do (
    if "%%A"=="distributionUrl" set "DIST_URL=%%B"
)
if not defined DIST_URL (
    echo ERROR: distributionUrl not found in %WRAPPER_PROPS% >&2
    exit /b 1
)

REM -- 2. Derive filename and base name -----------------------------------------
REM  e.g. .../apache-maven-3.9.15-bin.zip -> apache-maven-3.9.15-bin.zip
for %%F in (%DIST_URL%) do set "DIST_FILE=%%~nxF"
REM  Strip -bin.zip -> apache-maven-3.9.15
set "DIST_NAME=%DIST_FILE:-bin.zip=%"

REM -- 3. Locate the Maven dists cache ------------------------------------------
if defined MAVEN_USER_HOME (
    set "M2=%MAVEN_USER_HOME%"
) else (
    set "M2=%USERPROFILE%\.m2"
)
set "DISTS=%M2%\wrapper\dists\%DIST_NAME%"

REM -- 4. Scan for an already-extracted Maven installation ----------------------
set "MVN_CMD="
if exist "%DISTS%" (
    for /d %%D in ("%DISTS%\*") do (
        if exist "%%D\bin\mvn.cmd" (
            set "MVN_CMD=%%D\bin\mvn.cmd"
            goto :run
        )
    )
)

REM -- 5. Not cached - download and extract -------------------------------------
echo Downloading %DIST_FILE% ...
if not exist "%DISTS%" mkdir "%DISTS%"

set "TMP_ZIP=%DISTS%\%DIST_FILE%"
curl -L --fail -o "%TMP_ZIP%" "%DIST_URL%"
if errorlevel 1 (
    echo ERROR: Download failed from %DIST_URL% >&2
    exit /b 1
)

echo Extracting ...
tar -xf "%TMP_ZIP%" -C "%DISTS%"
if errorlevel 1 (
    echo ERROR: Extraction failed >&2
    exit /b 1
)
del /q "%TMP_ZIP%" 2>nul

for /d %%D in ("%DISTS%\*") do (
    if exist "%%D\bin\mvn.cmd" (
        set "MVN_CMD=%%D\bin\mvn.cmd"
        goto :run
    )
)
echo ERROR: mvn.cmd not found after extraction in %DISTS% >&2
exit /b 1

REM -- 6. Run Maven -------------------------------------------------------------
:run
"%MVN_CMD%" %*
