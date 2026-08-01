"""Asset register and the MIKOS sensors attached to it.

`assets` is the logical register — the six fields the product exposes about a
piece of equipment, and nothing else. `devices` is the physical MIKOS Smart
Energy Sensor bound to that asset: its serial, firmware, gateway binding and
relay state. Keeping them apart means replacing a sensor does not rewrite the
asset's history, and the asset record never grows fields the interface has no
business showing.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)

    # ── The six displayed fields ─────────────────────────────────────────
    asset_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    asset_name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    brand: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="Online")

    # ── Engineering attributes, never rendered as asset detail ───────────
    criticality: Mapped[str] = mapped_column(String(16), nullable=False, default="Medium")
    rated_power_w: Mapped[float] = mapped_column(Float, nullable=False, default=65.0)
    nominal_voltage_v: Mapped[float] = mapped_column(Float, nullable=False, default=19.5)
    max_temperature_c: Mapped[float] = mapped_column(Float, nullable=False, default=78.0)
    max_current_a: Mapped[float] = mapped_column(Float, nullable=False, default=4.6)

    commissioned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    devices: Mapped[list["Device"]] = relationship(back_populates="asset", cascade="all, delete-orphan")
    components: Mapped[list["AssetComponent"]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Asset {self.asset_id} {self.asset_name}>"


class AssetComponent(Base):
    """Serviceable parts of an asset.

    Wear lives here and nowhere else. Health, remaining useful life, failure
    probability and every maintenance figure downstream are computed from these
    rows, which is what stops two modules disagreeing about the same device.
    """

    __tablename__ = "asset_components"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 0.0 is new, 1.0 is failed. Monotonically increasing.
    wear: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    base_wear_per_day: Mapped[float] = mapped_column(Float, nullable=False, default=0.0003)
    expected_life_days: Mapped[float] = mapped_column(Float, nullable=False, default=1800.0)
    last_serviced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    asset: Mapped[Asset] = relationship(back_populates="components")

    def __repr__(self) -> str:
        return f"<AssetComponent {self.asset_id}/{self.name} wear={self.wear:.3f}>"


class Device(Base):
    """A MIKOS Smart Energy Sensor installed on an asset."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_uid: Mapped[str] = mapped_column(String(48), unique=True, index=True, nullable=False)
    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )

    sensor_model: Mapped[str] = mapped_column(String(64), nullable=False, default="MIKOS-SES-01")
    firmware_version: Mapped[str] = mapped_column(String(32), nullable=False, default="2.4.1")
    gateway_id: Mapped[str] = mapped_column(String(48), nullable=False, default="GW-EDGE-01")
    mqtt_topic: Mapped[str] = mapped_column(String(160), nullable=False, default="")

    relay_status: Mapped[str] = mapped_column(String(8), nullable=False, default="Closed")
    relay_operations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    asset: Mapped[Asset] = relationship(back_populates="devices")

    def __repr__(self) -> str:
        return f"<Device {self.device_uid} -> {self.asset_id}>"
