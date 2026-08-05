"""Asset Performance Management tables.

Two tables, and both are APM's alone. No existing table is altered by this
module, and nothing here duplicates a column that already exists elsewhere:
condition, wear and effectiveness are read from the tables that own them.

`work_orders` is the only genuinely *transactional* table the platform has. Every
other record it stores is a measurement or a snapshot of a conclusion — losing one
costs a point on a chart. A work order is a commitment: somebody approved spend,
somebody was dispatched, somebody signed the work off. It carries its own
lifecycle timestamps rather than a status column with an audit table behind it,
because the questions asked of it are "how long did approval take" and "was it
done by its due date", and both are subtractions between two columns on one row.

`apm_asset_snapshots` is the trend: one row per asset per analytics pass, holding
the composites APM computed. It exists so the module can answer "is this getting
better" without recomputing history it did not keep.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    work_order_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )
    #: Serviceable part the work is against, when the work is component-level.
    component: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # ── What and why ─────────────────────────────────────────────────────
    #: Corrective, Preventive, Predictive, Inspection, Replacement, Calibration.
    work_order_type: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    #: What caused it to exist: anomaly, prediction, schedule, recommendation,
    #: manual. This is the field the planned-versus-reactive ratio is computed
    #: from, so it is recorded at raise time and never inferred afterwards.
    origin: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="manual")
    #: True when the work was scheduled rather than forced by a failure.
    planned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # ── Priority, as APM scored it at raise time ──────────────────────────
    priority: Mapped[str] = mapped_column(String(16), index=True, nullable=False, default="Medium")
    priority_code: Mapped[str] = mapped_column(String(4), nullable=False, default="P3")
    priority_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    #: Criticality class and risk score of the asset when the order was raised.
    #: Kept on the row because they are the justification for the priority, and a
    #: justification that changes after the fact is not one.
    criticality_code: Mapped[str] = mapped_column(String(4), nullable=False, default="C")
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Lifecycle ────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False, default="Raised")
    #: State the order will return to when it comes off hold.
    held_from: Mapped[str | None] = mapped_column(String(16), nullable=True)

    assignee: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approver: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    raised_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Money and effort ─────────────────────────────────────────────────
    estimated_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    actual_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: Hours the asset was out of service for this job.
    downtime_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Outcome ──────────────────────────────────────────────────────────
    #: Resolved, Not-Reproduced, Deferred, Replaced, No-Fault-Found.
    resolution: Mapped[str | None] = mapped_column(String(32), nullable=True)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Comma-separated part names actually replaced. A list rather than a table
    #: because nothing queries across it — it is read back with its own order.
    parts_replaced: Mapped[str | None] = mapped_column(Text, nullable=True)
    findings: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    #: True when the work came back after being signed off. This is the rework
    #: rate, and it is the one figure that stops maintenance effectiveness being
    #: gamed by closing orders quickly.
    rework: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    #: AD event uids this order was raised against, comma-separated. The link that
    #: lets a confirmed outcome be handed back to the detector that raised it.
    anomaly_uids: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: Whether the outcome has been published back to AD and PdM.
    outcome_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_work_orders_asset_status", "asset_id", "status"),
        Index("ix_work_orders_status_due", "status", "due_at"),
    )

    def __repr__(self) -> str:
        return f"<WorkOrder {self.work_order_id} {self.asset_id} {self.status}>"


class ApmAssetSnapshot(Base):
    """One APM record per asset per analytics pass.

    A trend, not an audit log — pruned on the same schedule as the platform's
    other snapshot tables.
    """

    __tablename__ = "apm_asset_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)

    asset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("assets.asset_id", ondelete="CASCADE"), index=True, nullable=False
    )

    health_index: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    health_index_band: Mapped[str] = mapped_column(String(16), nullable=False, default="healthy")
    #: The gap between the index and PdM's condition score.
    condition_gap: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    criticality_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    criticality_code: Mapped[str] = mapped_column(String(4), nullable=False, default="C")

    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    risk_tier: Mapped[str] = mapped_column(String(16), nullable=False, default="healthy")
    priority_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    priority_code: Mapped[str] = mapped_column(String(4), nullable=False, default="P4")

    availability_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inherent_availability_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mtbf_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mttr_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    failure_rate_per_1000h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    downtime_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    effective_age_days: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ageing_factor: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    cost_exposure: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    downtime_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    repair_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    replacement_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    lifecycle_decision: Mapped[str] = mapped_column(String(20), nullable=False, default="monitor")

    utilisation_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    open_work_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_apm_snapshot_asset_computed", "asset_id", "computed_at"),)

    def __repr__(self) -> str:
        return f"<ApmSnapshot {self.asset_id} ahi={self.health_index:.1f} risk={self.risk_score:.1f}>"
