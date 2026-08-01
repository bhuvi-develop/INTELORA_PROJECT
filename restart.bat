@echo off
REM ====================================================================
REM  INTELORA - restart.
REM
REM  Stops everything, pauses long enough for the ports to be released by
REM  the operating system, then starts the platform again.
REM ====================================================================

chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"

echo.
echo =================================================
echo.
echo   INTELORA RESTARTING
echo.
echo =================================================
echo.

call "%~dp0stop.bat"

REM  Two seconds. A socket in TIME_WAIT is not yet reusable, and starting
REM  into a port the previous process has not finished releasing produces a
REM  bind error that looks like a fault but is only impatience.
ping -n 3 127.0.0.1 >nul

call "%~dp0start.bat"

endlocal
exit /b %errorlevel%
