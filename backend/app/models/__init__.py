"""ORM models.

Imported as a package so `Base.metadata` is complete before `create_all` or an
Alembic autogenerate run — a model that is never imported is a table that never
gets created.
"""

from app.models.anomaly import Alert, AnomalyDetection
from app.models.asset import Asset, AssetComponent, Device
from app.models.maintenance import AiInsight, AssetPerformance, Oee, PredictiveMaintenance
from app.models.telemetry import Telemetry
from app.models.user import User

__all__ = [
    "AiInsight",
    "Alert",
    "AnomalyDetection",
    "Asset",
    "AssetComponent",
    "AssetPerformance",
    "Device",
    "Oee",
    "PredictiveMaintenance",
    "Telemetry",
    "User",
]
