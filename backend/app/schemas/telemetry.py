"""Telemetry payloads.

The field set is the fourteen MIKOS parameters, in the order the sensor
publishes them, plus the health score the platform derived from the reading and
the operating mode that produced it.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiModel, DeviceStatus, Meta, Resolution


class TelemetryReading(ApiModel):
    asset_id: str
    device_uid: str
    ts: datetime = Field(description="Parameter 13 — reading timestamp, UTC")

    voltage: float = Field(description="Parameter 1 — V")
    current: float = Field(description="Parameter 2 — A")
    active_power: float = Field(description="Parameter 3 — W")
    apparent_power: float = Field(description="Parameter 4 — VA")
    reactive_power: float = Field(description="Parameter 5 — VAR")
    power_factor: float = Field(description="Parameter 6 — dimensionless")
    frequency: float = Field(description="Parameter 7 — Hz")
    energy_kwh: float = Field(description="Parameter 8 — kWh, cumulative")
    runtime_hours: float = Field(description="Parameter 9 — h, cumulative")
    temperature: float = Field(description="Parameter 10 — °C")
    relay_status: str = Field(description="Parameter 11 — Closed or Open")
    relay_operations: int = Field(description="Parameter 12 — cumulative count")
    device_status: DeviceStatus = Field(description="Parameter 14 — Online, Standby or Offline")

    health_score: float
    load_state: str
    resolution: Resolution = "second"
    source: str = "Simulator"
    present_parameters: list[str] = Field(default_factory=list)


class LiveTelemetry(ApiModel):
    readings: list[TelemetryReading]
    meta: Meta


class HistoryPoint(ApiModel):
    ts: datetime
    voltage: float
    current: float
    active_power: float
    apparent_power: float
    reactive_power: float
    power_factor: float
    frequency: float
    energy_kwh: float
    runtime_hours: float
    temperature: float
    relay_status: str
    relay_operations: int
    device_status: str
    health_score: float
    resolution: Resolution
    source: str = "Simulator"


class HistoryResponse(ApiModel):
    asset_id: str | None
    component: str | None
    resolution: Resolution
    start: datetime
    end: datetime
    count: int
    points: list[HistoryPoint]
    #: Stated so a caller knows the density it is looking at rather than
    #: inferring it from the gaps between timestamps.
    step_seconds: int
    meta: Meta
