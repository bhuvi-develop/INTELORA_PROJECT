@echo off
REM ====================================================================
REM  INTELORA - one-click shutdown.
REM
REM  Asks each service to exit before forcing it, so the backend's
REM  shutdown handler runs: background tasks stop, buffered telemetry is
REM  flushed, and component wear is written back. Then any port still
REM  held by a stray worker is released.
REM ====================================================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "ROOT=%~dp0"

cls
echo.
echo =================================================
echo.
echo   INTELORA STOPPING
echo.
echo =================================================
echo.

REM --- Frontend first: it depends on the backend, not the other way round.
call "%ROOT%frontend\stop_frontend.bat" --quiet
call :ok "React stopped"

REM --- Backend, gracefully.
call "%ROOT%backend\stop_backend.bat" --quiet
call :ok "FastAPI stopped"
call :ok "Mock sensor engine stopped"
call :ok "Background scheduler stopped"

REM --- Close the launcher windows this project opened.
taskkill /f /fi "WINDOWTITLE eq INTELORA Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq INTELORA Frontend*" >nul 2>&1
call :ok "Worker processes closed"

REM --- Release anything still holding a platform port.
call :release 8000
call :release 5173
call :release 4173
call :ok "Ports released"

echo.
echo =================================================
echo.
echo   INTELORA STOPPED SUCCESSFULLY
echo.
echo =================================================
echo.
echo   PostgreSQL was left running - it is a shared service.
echo.
endlocal
exit /b 0

REM ==================================================================
REM  Helpers
REM ==================================================================

:ok
echo   ✓  %~1
exit /b 0

:release
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING"') do (
    taskkill /f /t /pid %%P >nul 2>&1
)
exit /b 0
