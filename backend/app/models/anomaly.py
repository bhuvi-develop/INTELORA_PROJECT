"""Anomaly detection results and the operator-facing alerts raised from them.

The two are separate on purpose. An anomaly is a measurement fact: this channel
broke this limit by this much at this time. An alert is a piece of work: who
owns it, when it was claimed, when it was closed. One anomaly produces one
alert, but the alert's lifecycle is not the anomaly's.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

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


class AnomalyEventRecord(Base):
    """Taxonomy-resolved event store for the anomaly detection module.

    `anomaly_detection` above records the measurement fact against the channel
    rule that produced it, and the reporting endpoints read it. This table
    records the same events resolved to a failure mode — the M01–M15 identifier,
    the fault class, the 1 Hz sample they were raised from, and the ground-truth
    mechanism where the estate injected one.

    Both are written from the same detector journal in the same transaction by
    `persist_anomalies`, so neither can drift from the other; they are two
    projections of one source, not two sources.

    Two columns are carried beyond the specified schema because the table cannot
    do its job without them:

      · `source_uid` — the detector's own event id. Without it there is no stable
        key to update a lifecycle against, and every flush would re-insert.
      · `ingest_latency_ms` — measured at write time. A time-to-detect figure has
        to be measured somewhere, and the only place that knows both ends of the
        ingest leg is the write itself.
    """

    # Named `...Record` because the detector already owns a dataclass called
    # `AnomalyEvent`; `persistence.py` imports both and the two must not blur.
    __tablename__ = "anomaly_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    #: Detector event id, e.g. ANO-3F2A19BC4D0E. The upsert key.
    source_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    device_id: Mapped[str] = mapped_column(String(64), nullable=False)

    #: ELECTRICAL, THERMAL, DEGRADATION, COMMUNICATION, MECHANICAL, GRID_TRANSIENT.
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    #: Taxonomy identifier, e.g. M09_COOLING_FAILURE.
    type_id: Mapped[str] = mapped_column(String(64), nullable=False)

    #: CRITICAL, MAJOR, WARNING, INFO — the detector's own four bands.
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    #: ACTIVE, ACKNOWLEDGED, SELF_CLEARED, FALSE_POSITIVE.
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")

    #: Fraction past the device's own limit — 0.18 for a reading 18% over.
    breach_magnitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    #: The 1 Hz sample the event was raised from, stored verbatim so the evidence
    #: outlives the retention window on raw telemetry.
    telemetry_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    #: Ground truth when the estate injected a fault, e.g. "Cooling airflow
    #: restriction". Null for an event raised on the estate's own behaviour —
    #: which is what makes an honest precision figure possible.
    mechanism: Mapped[str | None] = mapped_column(String(128), nullable=True)

    #: Milliseconds from the sample timestamp to this row being written.
    ingest_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    feedback: Mapped[list[AnomalyFeedbackLog]] = relationship(
        back_populates="event", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        # Ordered to serve the status-bar and breakdown queries, which always
        # filter on status first and group by category.
        Index("idx_anomaly_status_cat", "status", "category", text("detected_at DESC")),
        Index("idx_anomaly_device", "device_id", text("detected_at DESC")),
        Index("idx_anomaly_type_id", "type_id"),
    )

    def __repr__(self) -> str:
        return f"<AnomalyEventRecord {self.type_id} {self.device_id} {self.status}>"


class AnomalyFeedbackLog(Base):
    """Technician judgement on a raised event.

    This is what makes precision measurable rather than assumed. A rule fires
    and the model corroborates, but only the engineer who went and looked knows
    whether the alert was worth raising. Persisted so that judgement survives a
    reload and accumulates into a retraining set.
    """

    __tablename__ = "anomaly_feedback_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("anomaly_events.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    #: FALSE_POSITIVE, CONFIRMED_TRUE, ACCEPTED_RECOMMENDATION.
    feedback_type: Mapped[str] = mapped_column(String(32), nullable=False)
    technician_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    event: Mapped[AnomalyEventRecord] = relationship(back_populates="feedback")

    __table_args__ = (Index("idx_feedback_event_type", "event_id", "feedback_type"),)

    def __repr__(self) -> str:
        return f"<AnomalyFeedback {self.feedback_type} {self.technician_id}>"
