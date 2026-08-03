"""APM persistence.

The only place in the module that knows PostgreSQL exists. Kept separate from the
work order engine so the engine's lifecycle rules can be tested and reasoned about
without a database, and so a database outage degrades durability rather than
stopping work.

Every function here is best-effort from the caller's point of view: the engine
wraps these calls and logs a failure rather than raising it at a technician who is
trying to close a job.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.database.base import session_scope
from app.logging_config import get_logger
from app.models.apm import ApmAssetSnapshot, WorkOrder

logger = get_logger(__name__)


def _split(value: str | None) -> list[str]:
    return [part for part in (value or "").split(",") if part]


def upsert_work_order(record) -> None:
    """Write one work order, inserting or updating by its natural key."""
    row = record.as_row()

    with session_scope() as session:
        existing = session.execute(
            select(WorkOrder).where(WorkOrder.work_order_id == record.work_order_id)
        ).scalar_one_or_none()

        if existing is None:
            session.add(WorkOrder(**row))
            return

        for key, value in row.items():
            setattr(existing, key, value)


def load_work_orders(limit: int = 5000) -> list:
    """Rebuild the in-memory queue from storage.

    Transition history is not stored per row — the lifecycle timestamps are the
    history, and they are on the row. Restored orders therefore carry a
    reconstructed history rather than the original transition notes, which is
    enough to answer every question the timeline is asked.
    """
    from app.services.apm.work_orders import TransitionRecord, WorkOrderRecord

    out: list[WorkOrderRecord] = []

    with session_scope() as session:
        rows = (
            session.execute(select(WorkOrder).order_by(WorkOrder.raised_at).limit(limit))
            .scalars()
            .all()
        )

        # The asset name and category live on the register, not on the order.
        from app.mock_data.catalog import SEED_BY_ID

        for row in rows:
            seed = SEED_BY_ID.get(row.asset_id)
            record = WorkOrderRecord(
                work_order_id=row.work_order_id,
                asset_id=row.asset_id,
                asset_name=seed.asset_name if seed else row.asset_id,
                category=seed.category if seed else "",
                component=row.component,
                work_order_type=row.work_order_type,
                origin=row.origin,
                planned=bool(row.planned),
                title=row.title,
                description=row.description or "",
                priority=row.priority,
                priority_code=row.priority_code,
                priority_score=float(row.priority_score),
                criticality_code=row.criticality_code,
                risk_score=float(row.risk_score),
                status=row.status,
                raised_at=row.raised_at,
                due_at=row.due_at,
                estimated_cost=float(row.estimated_cost),
                estimated_hours=float(row.estimated_hours),
                assignee=row.assignee,
                approver=row.approver,
                rejection_reason=row.rejection_reason,
                held_from=row.held_from,
                approved_at=row.approved_at,
                assigned_at=row.assigned_at,
                dispatched_at=row.dispatched_at,
                started_at=row.started_at,
                completed_at=row.completed_at,
                verified_at=row.verified_at,
                closed_at=row.closed_at,
                actual_cost=float(row.actual_cost) if row.actual_cost is not None else None,
                actual_hours=float(row.actual_hours) if row.actual_hours is not None else None,
                downtime_hours=float(row.downtime_hours),
                resolution=row.resolution,
                root_cause=row.root_cause,
                parts_replaced=_split(row.parts_replaced),
                findings=row.findings,
                verified_by=row.verified_by,
                rework=bool(row.rework),
                anomaly_uids=_split(row.anomaly_uids),
                outcome_published=bool(row.outcome_published),
                dirty=False,
            )

            # Reconstruct the timeline from the stamps that were recorded.
            for stamp, status in (
                (row.raised_at, "Raised"),
                (row.approved_at, "Approved"),
                (row.assigned_at, "Assigned"),
                (row.dispatched_at, "Dispatched"),
                (row.started_at, "InProgress"),
                (row.completed_at, "Completed"),
                (row.verified_at, "Verified"),
                (row.closed_at, "Closed"),
            ):
                if stamp is not None:
                    record.history.append(
                        TransitionRecord(
                            at=stamp,
                            from_status="",
                            to_status=status,
                            actor="restored",
                            note="Reconstructed from stored lifecycle timestamps",
                        )
                    )

            out.append(record)

    return out


def write_snapshots(rows: list[dict]) -> int:
    """Snapshot the APM composites for the trend."""
    if not rows:
        return 0
    with session_scope() as session:
        session.bulk_insert_mappings(ApmAssetSnapshot, rows)
    return len(rows)


def read_snapshots(
    asset_id: str | None = None,
    days: int = 7,
    limit: int = 2000,
) -> list[dict]:
    """Stored APM history, oldest first."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with session_scope() as session:
        statement = (
            select(ApmAssetSnapshot)
            .where(ApmAssetSnapshot.computed_at >= cutoff)
            .order_by(ApmAssetSnapshot.computed_at)
            .limit(limit)
        )
        if asset_id:
            statement = statement.where(ApmAssetSnapshot.asset_id == asset_id)

        return [
            {
                "asset_id": row.asset_id,
                "computed_at": row.computed_at,
                "health_index": row.health_index,
                "health_index_band": row.health_index_band,
                "criticality_score": row.criticality_score,
                "risk_score": row.risk_score,
                "risk_tier": row.risk_tier,
                "priority_score": row.priority_score,
                "availability_pct": row.availability_pct,
                "mtbf_hours": row.mtbf_hours,
                "mttr_minutes": row.mttr_minutes,
                "failure_rate_per_1000h": row.failure_rate_per_1000h,
                "downtime_hours": row.downtime_hours,
                "cost_exposure": row.cost_exposure,
                "effective_age_days": row.effective_age_days,
                "utilisation_pct": row.utilisation_pct,
            }
            for row in session.execute(statement).scalars().all()
        ]


def prune_snapshots(keep_days: int = 30) -> int:
    """Bound the snapshot table. It is a trend, not an audit log.

    Work orders are never pruned — they are the audit log.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    with session_scope() as session:
        result = session.execute(
            delete(ApmAssetSnapshot).where(ApmAssetSnapshot.computed_at < cutoff)
        )
        return int(result.rowcount or 0)
