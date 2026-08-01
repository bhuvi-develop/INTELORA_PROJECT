"""HTTP surface.

Every router is mounted under the configured API prefix, including the websocket,
so a single origin and a single prefix cover the whole platform. The liveness
probe is mounted at the root by `main`, where infrastructure expects it.
"""

from fastapi import APIRouter

from app.config import settings
from app.routers import (
    anomalies,
    apm,
    assets,
    dashboard,
    maintenance,
    oee,
    predictive,
    reports,
    system,
    telemetry,
)

api_router = APIRouter(prefix=settings.api_prefix)
api_router.include_router(dashboard.router)
api_router.include_router(assets.router)
api_router.include_router(telemetry.router)
api_router.include_router(anomalies.router)
api_router.include_router(predictive.router)
api_router.include_router(maintenance.preventive_router)
api_router.include_router(maintenance.prescriptive_router)
api_router.include_router(apm.router)
api_router.include_router(oee.router)
api_router.include_router(reports.router)
api_router.include_router(system.router)

__all__ = ["api_router"]
