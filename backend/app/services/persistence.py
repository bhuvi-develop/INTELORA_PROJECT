"""Writing the running platform into PostgreSQL.

Two cadences. Telemetry is written on the tick, in one bulk statement per flush,
because the specification asks for every generated record to be stored and
twenty-four single-row inserts a second is a waste of round trips. Derived state
— predictions, effectiveness, insights — is written on the slower analytics
cadence, since it is a snapshot of a conclusion rather than a measurement.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.anomaly import Alert, AnomalyDetection
from app.models.asset import Asset, AssetComponent, Device
from app.models.maintenance import AiInsight, AssetPerformance, Oee, PredictiveMaintenance
from app.models.telemetry import Telemetry
from app.services.anomaly_service import AnomalyDetector
from app.services.engine import Analytics, InteloraEngine
from app.services.simulator import Reading

logger = get_logger(__name__)


# ── Telemetry ────────────────────────────────────────────────────────────


def write_readings(session: Session, readings: list[Reading]) -> int:
    """Bulk-insert a batch of readings. Returns the number of rows written."""
    if not readings:
        return 0
    session.bulk_insert_mappings(Telemetry, [reading.as_row() for reading in readings])
    return len(readings)


def prune_raw_telemetry(session: Session, older_than_hours: int) -> int:
    """Drop per-second rows past the retention window.

    Only rows captured at second resolution are eligible. The down-sampled
    history written by the back-fill is what long-range analysis reads, and it
    is never pruned.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    result = session.execute(
        delete(Telemetry).where(Telemetry.resolution == "second", Telemetry.ts < cutoff)
    )
    removed = int(result.rowcount or 0)
    if removed:
        logger.info("pruned %d raw telemetry rows older than %dh", removed, older_than_hours)
    return removed


# ── Asset and device state ───────────────────────────────────────────────


def sync_asset_state(session: Session, engine: InteloraEngine) -> None:
    """Push live connectivity and relay state back onto the register."""
    now = datetime.now(timezone.utc)

    for asset_id, state in engine.simulator.states.items():
        session.execute(
            update(Asset).where(Asset.asset_id == asset_id).values(status=state.device_status)
        )
        session.execute(
            update(Device)
            .where(Device.asset_id == asset_id)
            .values(
                relay_status=state.relay_status,
                relay_operations=state.relay_operations,
                is_connected=state.device_status != "Offline",
                last_seen_at=now if state.device_status != "Offline" else Device.last_seen_at,
            )
        )


def sync_component_wear(session: Session, engine: InteloraEngine) -> None:
    """Persist component wear so a restart resumes from the estate's real age."""
    for asset_id, state in engine.simulator.states.items():
        for position, spec in enumerate(state.profile.components):
            if position >= len(state.wear):
                continue
            session.execute(
                update(AssetComponent)
                .where(AssetComponent.asset_id == asset_id, AssetComponent.name == spec.name)
                .values(wear=round(state.wear[position], 6))
            )


def restore_component_wear(session: Session, engine: InteloraEngine) -> int:
    """Load stored wear back into the simulator on startup.

    Without this a restart would rejuvenate the estate, and every remaining-life
    figure the platform has published would jump outward — exactly the behaviour
    the ratchet exists to prevent.
    """
    restored = 0
    rows = session.execute(
        select(AssetComponent.asset_id, AssetComponent.name, AssetComponent.wear)
    ).all()

    by_asset: dict[str, dict[str, float]] = {}
    for row in rows:
        by_asset.setdefault(row.asset_id, {})[row.name] = float(row.wear)

    for asset_id, state in engine.simulator.states.items():
        stored = by_asset.get(asset_id)
        if not stored:
            continue
        for position, spec in enumerate(state.profile.components):
            value = stored.get(spec.name)
            if value is None or position >= len(state.wear):
                continue
            # Never move wear backwards, even from the database.
            state.wear[position] = max(state.wear[position], value)
            restored += 1

    if restored:
        logger.info("restored wear for %d components from PostgreSQL", restored)
    return restored


def restore_meter_readings(session: Session, engine: InteloraEngine) -> int:
    """Resume the cumulative meters from the last stored reading.

    Energy, runtime and relay operations are meters: they count up and never
    reset. A restart that started them from zero would leave the archive
    non-monotonic, and every windowed figure computed as (max − min) — which is
    how consumption over a range is derived — would read the whole meter as
    having been consumed in whatever window contained the restart.
    """
    newest = (
        select(
            Telemetry.asset_id,
            Telemetry.energy_kwh,
            Telemetry.runtime_hours,
            Telemetry.relay_operations,
            Telemetry.ts,
        )
        .distinct(Telemetry.asset_id)
        .order_by(Telemetry.asset_id, Telemetry.ts.desc())
    )

    restored = 0
    for row in session.execute(newest).all():
        state = engine.simulator.states.get(row.asset_id)
        if state is None:
            continue
        state.energy_kwh = max(state.energy_kwh, float(row.energy_kwh))
        state.runtime_hours = max(state.runtime_hours, float(row.runtime_hours))
        state.relay_operations = max(state.relay_operations, int(row.relay_operations))
        restored += 1

    if restored:
        logger.info("resumed cumulative meters for %d devices from PostgreSQL", restored)
    return restored


# ── Anomalies and alerts ─────────────────────────────────────────────────


def persist_anomalies(session: Session, detector: AnomalyDetector) -> tuple[int, int]:
    """Write new events and update the lifecycle of ones already stored."""
    fresh = detector.unpersisted()
    updated = 0

    if fresh:
        session.bulk_insert_mappings(
            AnomalyDetection,
            [
                {
                    "anomaly_uid": event.uid,
                    "asset_id": event.asset_id,
                    "component": event.component,
                    "error_code": event.error_code,
                    "anomaly_type": event.anomaly_type,
                    "title": event.title,
                    "severity": event.severity,
                    "status": event.status,
                    "channel": event.channel,
                    "observed_value": event.observed_value,
                    "threshold_value": event.threshold_value,
                    "unit": event.unit,
                    "deviation_pct": event.deviation_pct,
                    "anomaly_score": event.anomaly_score,
                    "detection_method": event.detection_method,
                    "confidence": event.confidence,
                    "detail": event.detail,
                    "detected_at": event.detected_at,
                    "resolved_at": event.resolved_at,
                    "acknowledged_at": event.acknowledged_at,
                }
                for event in fresh
            ],
        )
        session.bulk_insert_mappings(
            Alert,
            [
                {
                    "alert_uid": f"ALT-{event.uid[4:]}",
                    "asset_id": event.asset_id,
                    "anomaly_uid": event.uid,
                    "severity": event.severity,
                    "category": event.anomaly_type,
                    "title": f"{event.error_code} · {event.title} on {event.asset_name}",
                    "message": event.detail,
                    "status": "Open",
                    "source": "detector",
                    "response_target_minutes": event.response_target_minutes,
                    "raised_at": event.detected_at,
                }
                for event in fresh
            ],
        )
        for event in fresh:
            event.persisted = True
            event.dirty = False

    for event in detector.journal:
        if not event.persisted or not event.dirty:
            continue
        session.execute(
            update(AnomalyDetection)
            .where(AnomalyDetection.anomaly_uid == event.uid)
            .values(
                status=event.status,
                resolved_at=event.resolved_at,
                acknowledged_at=event.acknowledged_at,
            )
        )
        session.execute(
            update(Alert)
            .where(Alert.anomaly_uid == event.uid)
            .values(
                status="Resolved"
                if event.status == "Resolved"
                else "Acknowledged"
                if event.status == "Acknowledged"
                else "Open",
                acknowledged_at=event.acknowledged_at,
                resolved_at=event.resolved_at,
            )
        )
        event.dirty = False
        updated += 1

    return len(fresh), updated


# ── Derived state ────────────────────────────────────────────────────────


def write_analytics(session: Session, analytics: Analytics) -> int:
    """Snapshot predictions, performance and effectiveness."""
    stamp = analytics.computed_at
    rows = 0

    predictions = [
        component.as_row(stamp)
        for prediction in analytics.predictions.values()
        for component in prediction.components
    ]
    if predictions:
        session.bulk_insert_mappings(PredictiveMaintenance, predictions)
        rows += len(predictions)

    performance = [entry.as_row(stamp) for entry in analytics.performance.values()]
    if performance:
        session.bulk_insert_mappings(AssetPerformance, performance)
        rows += len(performance)

    oee_rows = [entry.oee_row(stamp) for entry in analytics.performance.values()]
    if analytics.fleet_oee:
        from app.services.performance_service import PerformanceService

        oee_rows.append(PerformanceService.fleet_oee_row(analytics.fleet_oee, stamp))
    if oee_rows:
        session.bulk_insert_mappings(Oee, oee_rows)
        rows += len(oee_rows)

    return rows


def write_insights(session: Session, insights: list[dict]) -> int:
    if not insights:
        return 0
    session.bulk_insert_mappings(AiInsight, insights)
    return len(insights)


def prune_analytics(session: Session, keep_days: int = 30) -> int:
    """Bound the snapshot tables. They are a trend, not an audit log."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    removed = 0
    for model, column in (
        (PredictiveMaintenance, PredictiveMaintenance.computed_at),
        (AssetPerformance, AssetPerformance.computed_at),
        (Oee, Oee.computed_at),
        (AiInsight, AiInsight.generated_at),
    ):
        result = session.execute(delete(model).where(column < cutoff))
        removed += int(result.rowcount or 0)
    return removed


# ── Health ───────────────────────────────────────────────────────────────


def database_latency_ms(session: Session) -> tuple[bool, float]:
    """Round-trip time for a trivial statement."""
    start = time.perf_counter()
    try:
        session.execute(text("SELECT 1"))
        return True, (time.perf_counter() - start) * 1000.0
    except Exception as error:  # pragma: no cover - reported, not raised
        logger.error("database health check failed: %s", error)
        return False, 0.0