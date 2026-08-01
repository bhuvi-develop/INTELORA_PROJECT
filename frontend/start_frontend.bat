@echo off
REM ====================================================================
REM  INTELORA frontend launcher.
REM
REM  Installs npm packages if they are missing or out of date, starts
REM  Vite, and opens the browser.
REM
REM  The React application lives at the repository root, so this script
REM  resolves it relatively - the project runs from wherever it was
REM  cloned, and the frontend was never relocated.
REM
REM  Pass --no-browser to skip opening a tab; start.bat does that itself
REM  once both services are answering.
REM ====================================================================

chcp 65001 >nul 2>&1
title INTELORA Frontend
setlocal enabledelayedexpansion

set "APP=%~dp0.."
cd /d "%APP%"

set "FRONTEND_URL=http://localhost:5173"
set "OPEN_BROWSER=1"
if /i "%~1"=="--no-browser" set "OPEN_BROWSER=0"

echo.
echo ====================================
echo  Starting INTELORA Frontend
echo ====================================
echo.

REM --- Toolchain ------------------------------------------------------
node --version >nul 2>&1
if errorlevel 1 (
    echo   X  Node.js was not found.
    echo      Install the Node.js LTS release from https://nodejs.org.
    exit /b 1
)

if not exist "package.json" (
    echo   X  package.json was not found in %APP%.
    echo      The clone looks incomplete.
    exit /b 1
)

REM --- Dependencies ---------------------------------------------------
REM  Reinstall when the lockfile has moved on, and otherwise not at all:
REM  npm install on every start costs seconds for no benefit.
set "STAMP=node_modules\.intelora-lock.stamp"
set "CURRENT="
if exist "package-lock.json" (
    for /f "usebackq delims=" %%H in (`certutil -hashfile "package-lock.json" SHA256 ^| findstr /r "^[0-9a-f]"`) do (
        if not defined CURRENT set "CURRENT=%%H"
    )
) else (
    echo   !  package-lock.json is missing - npm will resolve versions fresh.
    set "CURRENT=no-lockfile"
)

set "INSTALLED="
if exist "%STAMP%" set /p INSTALLED=<"%STAMP%"

if not exist "node_modules" set "INSTALLED=none"

if not "!CURRENT!"=="!INSTALLED!" (
    echo   ...  Installing npm packages ...
    if exist "package-lock.json" (
        call npm ci --no-audit --no-fund
        if errorlevel 1 (
            echo   !  npm ci failed - falling back to npm install.
            call npm install --no-audit --no-fund
        )
    ) else (
        call npm install --no-audit --no-fund
    )
    if errorlevel 1 (
        echo   X  npm package installation failed.
        exit /b 1
    )
    > "%STAMP%" echo !CURRENT!
) else (
    echo   ✓  npm packages already installed
)

REM --- Free the port if a previous run left it held --------------------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do (
    taskkill /f /pid %%P >nul 2>&1
)

REM --- Browser ---------------------------------------------------------
REM  Opened before Vite takes over the console, on a short delay so the dev
REM  server is listening by the time the tab resolves.
if "%OPEN_BROWSER%"=="1" (
    REM  Poll for the entry module rather than sleeping a fixed interval: Vite
    REM  accepts connections while it is still pre-bundling dependencies, and a
    REM  tab opened in that window renders blank.
    start "" /min powershell -NoProfile -Command "for ($i=0; $i -lt 90; $i++) { try { $r = Invoke-WebRequest -Uri '%FRONTEND_URL%/src/main.tsx' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { Start-Process '%FRONTEND_URL%'; break } } catch { } Start-Sleep -Milliseconds 800 }"
)

echo.
echo ====================================
echo  Frontend Started Successfully
echo.
echo  %FRONTEND_URL%
echo ====================================
echo.

REM  Vite holds this window. Closing it stops the dev server.
call npm run dev -- --host localhost --port 5173 --strictPort

endlocal
exit /b 0
