"""Predictive maintenance, performance and effectiveness records.

Every figure in these tables is computed in Python from component wear and
measured uptime. Nothing here is calculated in the browser, and nothing here is
stored twice: performance and effectiveness are written as snapshots so trends
can be charted, while the live values always come from the service layer.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class PredictiveMaintenance(Base):
    __tablename__ = "predictive_maintenance"

    id: Mapped[int] = mapped_column(primary_key=True)

    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )
    component: Mapped[str] = mapped_column(String(80), index=True, nullable=False)

    wear: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    failure_probability: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rul_days: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    predicted_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    maintenance_priority: Mapped[str] = mapped_column(String(16), nullable=False, default="Low")

    # 'regression' once enough history exists for the degradation model to fit,
    # 'wear-rate' while it is still the analytical projection.
    model_version: Mapped[str] = mapped_column(String(32), nullable=False, default="wear-rate-1.0")
    horizon_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_predictive_asset_component", "asset_id", "component", "computed_at"),)

    def __repr__(self) -> str:
        return f"<Prediction {self.asset_id}/{self.component} rul={self.rul_days:.0f}d>"


class AssetPerformance(Base):
    __tablename__ = "asset_performance"

    id: Mapped[int] = mapped_column(primary_key=True)

    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )

    availability: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    performance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quality: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    uptime_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mtbf_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mttr_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    energy_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    energy_per_hour: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    anomalies_24h: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    health_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    health_band: Mapped[str] = mapped_column(String(16), nullable=False, default="healthy")
    criticality: Mapped[str] = mapped_column(String(16), nullable=False, default="Medium")
    risk_tier: Mapped[str] = mapped_column(String(16), nullable=False, default="healthy")

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_performance_asset_computed", "asset_id", "computed_at"),)

    def __repr__(self) -> str:
        return f"<Performance {self.asset_id} health={self.health_score:.1f}>"


class Oee(Base):
    __tablename__ = "oee"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 'asset' rows carry an asset_id; the 'fleet' row carries none.
    scope: Mapped[str] = mapped_column(String(8), index=True, nullable=False, default="asset")
    asset_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=True
    )

    availability: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    performance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quality: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    oee: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    target: Mapped[float] = mapped_column(Float, nullable=False, default=85.0)
    world_class: Mapped[float] = mapped_column(Float, nullable=False, default=92.0)

    availability_loss: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    performance_loss: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quality_loss: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<OEE {self.scope} {self.asset_id or 'fleet'} {self.oee:.1f}%>"


class AiInsight(Base):
    __tablename__ = "ai_insights"

    id: Mapped[int] = mapped_column(primary_key=True)

    scope: Mapped[str] = mapped_column(String(8), index=True, nullable=False, default="fleet")
    asset_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    module: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="cockpit")

    headline: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    recommendation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    business_impact: Mapped[str] = mapped_column(Text, nullable=False, default="")

    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="Info")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AiInsight {self.module}/{self.scope} {self.headline[:40]}>"
