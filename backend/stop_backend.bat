@echo off
REM ====================================================================
REM  INTELORA backend shutdown.
REM
REM  Asks the process to exit before forcing it, so FastAPI's shutdown
REM  handler runs: background tasks are cancelled, buffered telemetry is
REM  flushed, and component wear is written back so the next start
REM  resumes from the estate's real age.
REM
REM  Pass --quiet when calling from stop.bat, which prints its own banner.
REM ====================================================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "QUIET=0"
if /i "%~1"=="--quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo.
    echo ====================================
    echo  Stopping INTELORA Backend
    echo ====================================
    echo.
)

set "FOUND=0"

REM --- Find whatever is serving port 8000 -----------------------------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING"') do (
    set "PID=%%P"
    set "FOUND=1"

    if "%QUIET%"=="0" (
        echo Found backend on port 8000 with PID !PID!.
        echo Requesting graceful shutdown...
    )

    REM  Without /F this is a close request, which lets the shutdown handler
    REM  run. /F would drop the unflushed buffer on the floor.
    taskkill /pid !PID! >nul 2>&1

    REM  Give the shutdown sequence time to flush and close cleanly.
    REM  ping rather than timeout: timeout refuses to run when stdin is
    REM  redirected, which is exactly what happens under a task runner.
    ping -n 7 127.0.0.1 >nul 2>&1

    tasklist /fi "PID eq !PID!" 2>nul | findstr /i "!PID!" >nul
    if not errorlevel 1 (
        if "%QUIET%"=="0" echo Process did not exit - forcing termination.
        taskkill /f /t /pid !PID! >nul 2>&1
    )
)

REM  Close the launcher window start.bat opened, if it is still up.
taskkill /f /fi "WINDOWTITLE eq INTELORA Backend*" >nul 2>&1

if "%QUIET%"=="0" (
    echo.
    echo ====================================
    if "!FOUND!"=="0" (
        echo  No backend was running on port 8000.
    ) else (
        echo  Backend Stopped Successfully
        echo   - FastAPI terminated
        echo   - Mock sensor engine halted
        echo   - Background workers stopped
        echo   - Port 8000 released
    )
    echo ====================================
    echo.
)

endlocal
exit /b 0
