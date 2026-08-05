"""Telemetry records.

One row is one MIKOS reading: the fourteen parameters the sensor publishes,
plus the health score the platform derived from it at that moment. Storing the
derived score alongside the reading means a historical chart shows what the
platform actually believed at the time rather than what today's model would say
about yesterday's data.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    asset_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    device_uid: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)

    # Sampling density of this row: 'second' for live capture, and 'minute',
    # 'quarter' or 'hour' for the down-sampled history. Queries pick the
    # coarsest resolution that still answers the question asked.
    resolution: Mapped[str] = mapped_column(String(8), nullable=False, default="second", index=True)

    # ── The fourteen MIKOS parameters ───────────────────────────────────
    voltage: Mapped[float] = mapped_column(Float, nullable=False)            # 1  V
    current: Mapped[float] = mapped_column(Float, nullable=False)            # 2  A
    active_power: Mapped[float] = mapped_column(Float, nullable=False)       # 3  W
    apparent_power: Mapped[float] = mapped_column(Float, nullable=False)     # 4  VA
    reactive_power: Mapped[float] = mapped_column(Float, nullable=False)     # 5  VAR
    power_factor: Mapped[float] = mapped_column(Float, nullable=False)       # 6  −
    frequency: Mapped[float] = mapped_column(Float, nullable=False)          # 7  Hz
    energy_kwh: Mapped[float] = mapped_column(Float, nullable=False)         # 8  kWh, cumulative
    runtime_hours: Mapped[float] = mapped_column(Float, nullable=False)      # 9  h, cumulative
    temperature: Mapped[float] = mapped_column(Float, nullable=False)        # 10 °C
    relay_status: Mapped[str] = mapped_column(String(8), nullable=False)     # 11 Closed / Open
    relay_operations: Mapped[int] = mapped_column(Integer, nullable=False)   # 12 count
    # 13 timestamp is `ts` above
    device_status: Mapped[str] = mapped_column(String(16), nullable=False)   # 14 Online/Standby/Offline

    # ── Derived at capture time ─────────────────────────────────────────
    health_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    load_state: Mapped[str] = mapped_column(String(24), nullable=False, default="Idle")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="Simulator", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The shape of every query this table serves: one asset, one time range,
        # newest first.
        Index("ix_telemetry_asset_ts", "asset_id", "ts"),
        Index("ix_telemetry_resolution_ts", "resolution", "ts"),
    )

    def __repr__(self) -> str:
        return f"<Telemetry {self.asset_id} @ {self.ts:%Y-%m-%d %H:%M:%S} {self.active_power:.1f} W>"
