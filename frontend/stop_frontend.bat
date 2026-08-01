@echo off
REM ====================================================================
REM  INTELORA frontend shutdown.
REM
REM  Stops the Vite dev server and releases the ports it was holding.
REM  Pass --quiet when calling from stop.bat, which prints its own banner.
REM ====================================================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set "QUIET=0"
if /i "%~1"=="--quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo.
    echo ====================================
    echo  Stopping INTELORA Frontend
    echo ====================================
    echo.
)

set "FOUND=0"

REM  5173 is the dev server; 4173 is the preview server for a production build.
for %%A in (5173 4173) do (
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%%A .*LISTENING"') do (
        set "FOUND=1"
        if "%QUIET%"=="0" echo   Stopping process %%P on port %%A ...
        REM  /t so the node worker under the cmd wrapper goes with it.
        taskkill /f /t /pid %%P >nul 2>&1
    )
)

REM  Close the launcher window start.bat opened, if it is still up.
taskkill /f /fi "WINDOWTITLE eq INTELORA Frontend*" >nul 2>&1

if "%QUIET%"=="0" (
    echo.
    echo ====================================
    if "!FOUND!"=="0" (
        echo  No frontend was running.
    ) else (
        echo  Frontend Stopped Successfully
    )
    echo ====================================
    echo.
)

endlocal
exit /b 0
