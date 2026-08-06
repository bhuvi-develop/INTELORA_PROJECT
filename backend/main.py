"""INTELORA backend.

Starting this process is the whole operation. The lifespan handler creates the
database if it is missing, ensures the schema, seeds the asset register, restores
the estate's accumulated wear, back-fills thirty days of history if none is
stored, and then starts the MIKOS sensor engine ticking once a second. Nothing
requires a manual trigger and no separate worker process is involved.

Run it with:

    python main.py
    uvicorn main:app --host 0.0.0.0 --port 8000

or through `start_backend.bat`, which also creates the virtual environment and
installs the requirements.
"""

from __future__ import annotations

import contextlib
import time
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.requests import Request

from app.config import settings
from app.database.backfill import history_present, run_backfill
from app.database.base import session_scope
from app.database.init_db import create_tables, ensure_database, initialise
from app.logging_config import configure_logging, get_logger
from app.routers import api_router
from app.services.engine import engine
from app.services.persistence import restore_component_wear, restore_meter_readings
from app.services.scheduler import build_scheduler

configure_logging()
logger = get_logger("intelora.main")

BANNER = r"""
====================================
 INTELORA Backend Started

 API      http://localhost:{port}
 Swagger  http://localhost:{port}/docs
====================================
"""


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("%s %s starting in %s mode", settings.app_name, settings.app_version, settings.environment)

    ensure_database()
    create_tables()

    with session_scope() as session:
        initialise(session)
        # Resume from the estate's real age. Without this a restart would
        # rejuvenate every device and every published remaining-life figure
        # would jump outward.
        restore_component_wear(session, engine)

    generated = False
    if settings.backfill_on_startup:
        with session_scope() as session:
            if history_present(session):
                logger.info("history already stored — skipping back-fill")
                engine.history_backfilled = True
            else:
                logger.info("no history found — generating %d days", settings.history_days)
                run_backfill(session, engine)
                generated = True

    if not generated:
        # Resume the cumulative meters. Skipped when the back-fill just ran,
        # because that run produced them itself and reading them back would
        # count the same energy twice.
        with session_scope() as session:
            restore_meter_readings(session, engine)

    # First analytics pass before the API accepts traffic, so the very first
    # request returns a fully populated estate rather than an empty shell.
    engine.fit_models()
    engine.refresh_analytics()

    scheduler = build_scheduler(engine)
    await scheduler.start()

    # Flushed explicitly: Python block-buffers stdout when it is redirected to a
    # file or a pipe, and the launcher script does exactly that.
    print(BANNER.format(port=settings.port), flush=True)
    logger.info("startup complete — %d devices streaming", len(engine.simulator.states))

    try:
        yield
    finally:
        logger.info("shutdown requested")
        await scheduler.stop()
        with session_scope() as session:
            from app.services.persistence import (
                persist_anomalies,
                sync_asset_state,
                sync_component_wear,
            )

            sync_component_wear(session, engine)
            sync_asset_state(session, engine)
            persist_anomalies(session, engine.detector)
        logger.info("shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend for the INTELORA Enterprise AIoT platform. Simulates the MIKOS Smart Energy Sensor "
        "across a commissioned estate of Laptops and Mobile Chargers, stores every reading in "
        "PostgreSQL, and computes all condition, anomaly, predictive and effectiveness figures in "
        "Python — the frontend calculates none of them."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_header(request: Request, call_next):
    """Report server time on every response.

    The platform reports its own API latency on the cockpit; measuring it here
    means that figure is the real thing rather than an estimate.
    """
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
    return response


app.include_router(api_router)


@app.get("/health", tags=["System"], summary="Liveness probe")
def health() -> dict:
    """Readiness of the four things the platform needs to be useful.

    The launcher polls this to decide when the backend is actually up, so it
    reports the database and the sensor engine rather than merely confirming
    that a process is listening — a service that answers while its stream is
    dead is not ready, and saying otherwise would let the launcher open a
    browser onto an empty dashboard.
    """
    database_ok = True
    try:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    sensor_running = engine.running and engine.tick > 0
    healthy = database_ok and sensor_running

    return {
        "status": "healthy" if healthy else "starting",
        "database": "connected" if database_ok else "disconnected",
        "mock_sensor": "running" if sensor_running else "stopped",
        "api": "online",
        # Diagnostics beyond the contract, useful when the answer is "starting".
        "service": settings.app_name,
        "version": settings.app_version,
        "tick": engine.tick,
        "assets": len(engine.active_states),
        "at": datetime.now(timezone.utc),
    }


@app.get("/", tags=["System"], summary="Service index")
def index() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "api": settings.api_prefix,
        "websocket": f"{settings.api_prefix}/ws/telemetry",
        "endpoints": [
            f"{settings.api_prefix}/dashboard",
            f"{settings.api_prefix}/assets",
            f"{settings.api_prefix}/assets/{{asset_id}}",
            f"{settings.api_prefix}/telemetry/live",
            f"{settings.api_prefix}/telemetry/history",
            f"{settings.api_prefix}/anomalies",
            f"{settings.api_prefix}/predictive",
            f"{settings.api_prefix}/apm",
            f"{settings.api_prefix}/oee",
        ],
    }


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    """Never leak a traceback to a caller, and never lose one from the log."""
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "path": request.url.path},
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
