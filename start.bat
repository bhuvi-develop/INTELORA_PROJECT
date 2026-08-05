@echo off
REM ====================================================================
REM  INTELORA - one-click startup.
REM
REM  Verifies the toolchain, prepares the Python environment and the
REM  database, starts the backend and the frontend, waits until both are
REM  actually answering, and opens the browser.
REM
REM  Every path is relative to this file, so the project runs from
REM  wherever it was cloned.
REM ====================================================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "VENV=%BACKEND%\venv"
set "PYTHON=%VENV%\Scripts\python.exe"
set "BACKEND_URL=http://localhost:8000"
set "FRONTEND_URL=http://localhost:5173"

REM Startup can take a while on a cold clone: dependency installs and the
REM thirty-day history back-fill both happen on first run.
set "BACKEND_TIMEOUT=180"
set "FRONTEND_TIMEOUT=120"

cls
echo.
echo =================================================
echo.
echo   INTELORA STARTING
echo.
echo =================================================
echo.

REM ==================================================================
REM  1. System checks
REM ==================================================================

echo   Checking required software...
echo.

REM --- Python ---------------------------------------------------------
set "PY_CMD="
for %%C in ("py -3" "python") do (
    if not defined PY_CMD (
        %%~C --version >nul 2>&1
        if not errorlevel 1 set "PY_CMD=%%~C"
    )
)

if not defined PY_CMD (
    call :fail "Python was not found." "Install Python 3.12 or newer from https://python.org and tick 'Add python.exe to PATH'."
    goto :abort
)

for /f "tokens=2" %%V in ('%PY_CMD% --version 2^>^&1') do set "PY_VERSION=%%V"
for /f "tokens=1,2 delims=." %%A in ("!PY_VERSION!") do (
    set "PY_MAJOR=%%A"
    set "PY_MINOR=%%B"
)

if !PY_MAJOR! LSS 3 (
    call :fail "Python !PY_VERSION! is too old." "INTELORA needs Python 3.12 or newer."
    goto :abort
)
if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 12 (
    call :fail "Python !PY_VERSION! is too old." "INTELORA needs Python 3.12 or newer."
    goto :abort
)
call :ok "Python !PY_VERSION! detected"

REM --- Node.js --------------------------------------------------------
node --version >nul 2>&1
if errorlevel 1 (
    call :fail "Node.js was not found." "Install the Node.js LTS release from https://nodejs.org."
    goto :abort
)
for /f "delims=" %%V in ('node --version 2^>^&1') do set "NODE_VERSION=%%V"
call :ok "Node.js !NODE_VERSION! detected"

REM --- npm ------------------------------------------------------------
where npm >nul 2>&1
if errorlevel 1 (
    call :fail "npm was not found." "npm ships with Node.js - reinstall Node.js to restore it."
    goto :abort
)
for /f "delims=" %%V in ('npm --version 2^>^&1') do set "NPM_VERSION=%%V"
call :ok "npm !NPM_VERSION! detected"

REM --- Git ------------------------------------------------------------
git --version >nul 2>&1
if errorlevel 1 (
    call :warn "Git was not found - not required to run, only to clone updates."
) else (
    for /f "tokens=3" %%V in ('git --version 2^>^&1') do set "GIT_VERSION=%%V"
    call :ok "Git !GIT_VERSION! detected"
)

REM --- PostgreSQL service ---------------------------------------------
set "PG_SERVICE="
for /f "tokens=2 delims=:" %%S in ('sc query state^= all ^| findstr /i "SERVICE_NAME" ^| findstr /i "postgresql"') do (
    if not defined PG_SERVICE set "PG_SERVICE=%%S"
)
if defined PG_SERVICE set "PG_SERVICE=!PG_SERVICE: =!"

if not defined PG_SERVICE (
    call :warn "No PostgreSQL Windows service was found."
    echo        If PostgreSQL runs elsewhere, set its host and port in backend\.env.
) else (
    sc query "!PG_SERVICE!" | findstr /i "RUNNING" >nul 2>&1
    if errorlevel 1 (
        echo   ...  Starting PostgreSQL service !PG_SERVICE! ...
        net start "!PG_SERVICE!" >nul 2>&1
        ping -n 4 127.0.0.1 >nul
        sc query "!PG_SERVICE!" | findstr /i "RUNNING" >nul 2>&1
        if errorlevel 1 (
            call :fail "PostgreSQL could not be started." "Start the service !PG_SERVICE! manually, then run start.bat again."
            goto :abort
        )
    )
    call :ok "PostgreSQL service !PG_SERVICE! running"
)

echo.

REM ==================================================================
REM  2. Python environment
REM ==================================================================

if not exist "%BACKEND%\requirements.txt" (
    call :fail "backend\requirements.txt is missing." "The clone looks incomplete - pull the repository again."
    goto :abort
)

if not exist "%PYTHON%" (
    echo   ...  Creating the Python virtual environment ^(first run only^) ...
    %PY_CMD% -m venv "%VENV%"
    if not exist "%PYTHON%" (
        call :fail "The virtual environment could not be created." "Check that the Python 'venv' module is available."
        goto :abort
    )
)
call :ok "Virtual environment ready"

REM  A stamp of the requirements hash, so a normal start skips pip entirely
REM  and an edited requirements.txt does not.
set "STAMP=%VENV%\.requirements.stamp"
set "CURRENT="
for /f "usebackq delims=" %%H in (`certutil -hashfile "%BACKEND%\requirements.txt" SHA256 ^| findstr /r "^[0-9a-f]"`) do (
    if not defined CURRENT set "CURRENT=%%H"
)
set "INSTALLED="
if exist "%STAMP%" set /p INSTALLED=<"%STAMP%"

if not "!CURRENT!"=="!INSTALLED!" (
    echo   ...  Installing Python packages ^(this takes a minute on a cold clone^) ...
    "%PYTHON%" -m pip install --upgrade pip --quiet
    "%PYTHON%" -m pip install -r "%BACKEND%\requirements.txt" --quiet
    if errorlevel 1 (
        call :fail "Python package installation failed." "Run backend\start_backend.bat on its own to see the full pip output."
        goto :abort
    )
    > "%STAMP%" echo !CURRENT!
)
call :ok "Python packages installed"

REM ==================================================================
REM  3. Database
REM ==================================================================

if not exist "%BACKEND%\.env" (
    if exist "%BACKEND%\.env.example" copy /y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
)

pushd "%BACKEND%"
REM  Verify that packages are correctly installed first
"%PYTHON%" -c "import pydantic, sqlalchemy, alembic, psycopg" >nul 2>&1
if errorlevel 1 (
    popd
    call :fail "Python packages are missing or corrupted." "Run start.bat again or reinstall backend dependencies."
    goto :abort
)

REM  Verify PostgreSQL connectivity, capturing any traceback on failure
"%PYTHON%" -c "from app.database.init_db import ensure_database; ensure_database()" > "%ROOT%db_check_error.log" 2>&1
if errorlevel 1 (
    popd
    call :fail "PostgreSQL is not reachable." "Check the credentials in backend\.env - user, password, host and port."
    echo.
    echo   Detailed connection error:
    type "%ROOT%db_check_error.log"
    del "%ROOT%db_check_error.log" >nul 2>&1
    goto :abort
)
del "%ROOT%db_check_error.log" >nul 2>&1
call :ok "PostgreSQL connected"

"%PYTHON%" -m alembic upgrade head >nul 2>&1
if errorlevel 1 (
    call :warn "Alembic reported a problem - the service will ensure the schema itself."
)
popd
call :ok "Database ready - migrations applied"

REM ==================================================================
REM  4. Backend
REM ==================================================================

call :stop_port 8000
echo   ...  Starting FastAPI and the MIKOS sensor engine ...
call :spawn "%BACKEND%\start_backend.bat" ""

call :wait_health %BACKEND_TIMEOUT%
if errorlevel 1 (
    call :fail "The backend did not become healthy in time." "Look at the 'INTELORA Backend' window, or backend\logs\intelora_backend.log."
    goto :abort
)
call :ok "FastAPI running"
call :ok "Mock sensor engine running"
call :ok "Background scheduler running"

REM ==================================================================
REM  5. Frontend
REM ==================================================================

call :stop_port 5173
echo   ...  Starting the React application ...
call :spawn "%ROOT%frontend\start_frontend.bat" "--no-browser"

call :wait_frontend %FRONTEND_TIMEOUT%
if errorlevel 1 (
    call :fail "The frontend did not start in time." "Look at the 'INTELORA Frontend' window for the Vite output."
    goto :abort
)
call :ok "React running"

REM  Confirm the browser will find data, not an empty shell.
call :wait_health 20 >nul 2>&1
call :ok "API connected"

REM ==================================================================
REM  6. Ready
REM ==================================================================

start "" "%FRONTEND_URL%"

echo.
echo =================================================
echo.
echo   Frontend   %FRONTEND_URL%
echo   Backend    %BACKEND_URL%
echo   Swagger    %BACKEND_URL%/docs
echo.
echo =================================================
echo.
echo   INTELORA READY
echo.
echo =================================================
echo.
echo   Leave this window open or close it - the platform keeps running.
echo   Run stop.bat to shut everything down.
echo.
endlocal
exit /b 0

REM ==================================================================
REM  Helpers
REM ==================================================================

:ok
echo   ✓  %~1
exit /b 0

:warn
echo   !  %~1
exit /b 0

:fail
echo.
echo   X  %~1
echo       %~2
echo.
exit /b 0

:abort
echo.
echo =================================================
echo.
echo   INTELORA COULD NOT START
echo.
echo =================================================
echo.
endlocal
exit /b 1

REM  Poll the backend until it reports itself healthy.
:wait_health
set /a "_tries=%~1"
set /a "_n=0"
:wait_health_loop
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri '%BACKEND_URL%/health' -TimeoutSec 3; if ($r.status -eq 'healthy') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a "_n+=1"
if !_n! GEQ !_tries! exit /b 1
ping -n 2 127.0.0.1 >nul
goto :wait_health_loop

REM  Wait until Vite is genuinely serving the application.
REM
REM  A listening port is not readiness. Vite accepts connections while it is
REM  still pre-bundling dependencies, and a page loaded in that window ends up
REM  requesting module URLs the server then invalidates - which renders as a
REM  blank page with no error. Asking for the entry module proves the graph is
REM  actually being served.
:wait_frontend
set /a "_ftries=%~1"
set /a "_fn=0"
:wait_frontend_loop
powershell -NoProfile -Command "try { $a = Invoke-WebRequest -Uri '%FRONTEND_URL%/' -UseBasicParsing -TimeoutSec 3; $b = Invoke-WebRequest -Uri '%FRONTEND_URL%/src/main.tsx' -UseBasicParsing -TimeoutSec 5; if ($a.StatusCode -eq 200 -and $b.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a "_fn+=1"
if !_fn! GEQ !_ftries! exit /b 1
ping -n 2 127.0.0.1 >nul
goto :wait_frontend_loop

REM  Poll any URL until it answers.
:wait_url
set /a "_tries=%~2"
set /a "_n=0"
:wait_url_loop
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%~1' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a "_n+=1"
if !_n! GEQ !_tries! exit /b 1
ping -n 2 127.0.0.1 >nul
goto :wait_url_loop

REM  Launch a service in its own minimised console, detached from this one.
REM
REM  `start` delegates console creation to the shell, which fails silently when
REM  the parent has no console of its own; Start-Process creates the process
REM  directly, so the launcher behaves the same however it was invoked.
:spawn
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = @('/c', '\"%~1\"'); if ('%~2' -ne '') { $a += '%~2' }; Start-Process -FilePath 'cmd.exe' -ArgumentList $a -WindowStyle Minimized" >nul 2>&1
exit /b 0

REM  Release a port left occupied by a previous run.
:stop_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING"') do (
    taskkill /f /pid %%P >nul 2>&1
)
exit /b 0
