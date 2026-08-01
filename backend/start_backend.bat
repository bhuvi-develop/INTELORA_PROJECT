@echo off
REM ====================================================================
REM  INTELORA backend launcher.
REM
REM  Creates the virtual environment, installs the requirements, verifies
REM  PostgreSQL, applies migrations, and starts FastAPI with the MIKOS
REM  sensor engine publishing once per second.
REM
REM  Safe to run repeatedly and safe to run on its own - start.bat calls
REM  this same script rather than duplicating any of it.
REM ====================================================================

chcp 65001 >nul 2>&1
title INTELORA Backend
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "VENV_DIR=venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"

echo.
echo ====================================
echo  Starting INTELORA Backend
echo ====================================
echo.

REM --- Virtual environment --------------------------------------------
if not exist "%PYTHON%" (
    echo [1/6] Creating virtual environment...
    py -3 -m venv "%VENV_DIR%" 2>nul
    if not exist "%PYTHON%" python -m venv "%VENV_DIR%"
    if not exist "%PYTHON%" (
        echo.
        echo ERROR: could not create the virtual environment.
        echo        Install Python 3.12 or newer and ensure it is on PATH.
        exit /b 1
    )
) else (
    echo [1/6] Virtual environment present.
)

REM --- Dependencies ---------------------------------------------------
REM  A stamp file records the requirements hash actually installed, so a
REM  normal start skips pip entirely and an edited requirements.txt does not.
set "STAMP=%VENV_DIR%\.requirements.stamp"
set "CURRENT="
for /f "usebackq delims=" %%H in (`certutil -hashfile requirements.txt SHA256 ^| findstr /r "^[0-9a-f]"`) do (
    if not defined CURRENT set "CURRENT=%%H"
)

set "INSTALLED="
if exist "%STAMP%" set /p INSTALLED=<"%STAMP%"

if not "!CURRENT!"=="!INSTALLED!" (
    echo [2/6] Installing Python packages...
    "%PYTHON%" -m pip install --upgrade pip --quiet
    "%PYTHON%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo ERROR: dependency installation failed.
        exit /b 1
    )
    > "%STAMP%" echo !CURRENT!
) else (
    echo [2/6] Python packages already installed.
)

REM --- Configuration --------------------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        echo [3/6] No .env found - copying .env.example.
        copy /y ".env.example" ".env" >nul
    ) else (
        echo [3/6] No .env found - using built-in defaults.
    )
) else (
    echo [3/6] Configuration loaded from .env.
)

REM --- PostgreSQL -----------------------------------------------------
echo [4/6] Verifying PostgreSQL...
"%PYTHON%" -c "from app.database.init_db import ensure_database; ensure_database()"
if errorlevel 1 (
    echo.
    echo ERROR: PostgreSQL is not reachable.
    echo        Start the PostgreSQL service and check the credentials in .env.
    exit /b 1
)

REM --- Migrations -----------------------------------------------------
REM  Alembic owns the schema. The application also ensures it on startup
REM  so a fresh clone runs even before a migration has been stamped.
echo [5/6] Applying database migrations...
"%PYTHON%" -m alembic upgrade head
if errorlevel 1 (
    echo WARNING: migration step reported an error - the application will
    echo          ensure the schema directly on startup.
)

REM --- Free the port if a previous run left it held ---------------------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING"') do (
    taskkill /f /pid %%P >nul 2>&1
)

REM --- Run ------------------------------------------------------------
echo [6/6] Starting FastAPI and the MIKOS sensor engine...
echo.
echo ====================================
echo  Backend Started Successfully
echo.
echo  http://localhost:8000
echo  http://localhost:8000/docs
echo ====================================
echo.

REM  Uvicorn holds this window. The lifespan handler starts the sensor
REM  engine, the background scheduler and the one-second telemetry stream.
"%PYTHON%" main.py

endlocal
exit /b 0
