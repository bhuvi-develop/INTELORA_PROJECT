"""Anomaly detection results and the operator-facing alerts raised from them.

The two are separate on purpose. An anomaly is a measurement fact: this channel
broke this limit by this much at this time. An alert is a piece of work: who
owns it, when it was claimed, when it was closed. One anomaly produces one
alert, but the alert's lifecycle is not the anomaly's.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AnomalyDetection(Base):
    __tablename__ = "anomaly_detection"

    id: Mapped[int] = mapped_column(primary_key=True)
    anomaly_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )
    component: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Stable operator-facing code, e.g. ANO-1006. Memorised by operators, so it
    # is a fixed identifier rather than a generated one.
    error_code: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    anomaly_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False, default="Active")

    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    observed_value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    deviation_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Continuous score from the isolation forest, 0–1. Independent of the rule
    # that raised the event: the rule decides, the model corroborates.
    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    detection_method: Mapped[str] = mapped_column(String(16), nullable=False, default="rule")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_anomaly_asset_detected", "asset_id", "detected_at"),)

    def __repr__(self) -> str:
        return f"<Anomaly {self.error_code} {self.asset_id} {self.severity}>"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )
    anomaly_uid: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    severity: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="anomaly")
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")

    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False, default="Open")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="detector")

    # Minutes from raise to acknowledgement that the policy allows for this
    # severity. Stored with the alert so a policy change does not silently
    # rewrite whether past alerts were answered in time.
    response_target_minutes: Mapped[int] = mapped_column(nullable=False, default=60)

    acknowledged_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raised_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Alert {self.alert_uid} {self.status}>"
