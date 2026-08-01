"""Estate-level projections for the cockpit.

Energy, the prior-day comparison and the activity journal are read from
PostgreSQL rather than from memory, because they are questions about the past
and the past is what the database is for. Everything else on the cockpit comes
from the live engine snapshot.

Energy is stored cumulatively per device, so consumption over any window is the
difference between the last and first reading in it. That is exact, needs no
separate accumulator, and cannot drift away from the meter the way a
re-integrated figure would.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.maintenance import Oee
from app.models.telemetry import Telemetry
from app.services.derive import band_of
from app.services.engine import InteloraEngine

#: Commercial tariff and grid intensity used for the cost and carbon lines.
TARIFF_PER_KWH = 0.14
CARBON_KG_PER_KWH = 0.42
CURRENCY = "USD"


def _window_energy(session: Session, start: datetime, end: datetime) -> dict[str, float]:
    """Consumption per asset between two instants, in kWh."""
    rows = session.execute(
        select(
            Telemetry.asset_id,
            (func.max(Telemetry.energy_kwh) - func.min(Telemetry.energy_kwh)).label("kwh"),
        )
        .where(Telemetry.ts >= start, Telemetry.ts < end)
        .group_by(Telemetry.asset_id)
    ).all()
    return {row.asset_id: float(row.kwh or 0.0) for row in rows}


def energy_intelligence(session: Session, engine: InteloraEngine, now: datetime | None = None) -> dict:
    stamp = now or datetime.now(timezone.utc)
    midnight = stamp.replace(hour=0, minute=0, second=0, microsecond=0)

    today = _window_energy(session, midnight, stamp + timedelta(seconds=1))
    yesterday = _window_energy(session, midnight - timedelta(days=1), midnight)
    weekly = _window_energy(session, stamp - timedelta(days=7), stamp + timedelta(seconds=1))
    monthly = _window_energy(session, stamp - timedelta(days=30), stamp + timedelta(seconds=1))

    today_total = round(sum(today.values()), 4)
    yesterday_total = round(sum(yesterday.values()), 4)
    change = (
        round((today_total - yesterday_total) / yesterday_total * 100.0, 1)
        if yesterday_total > 0
        else 0.0
    )

    names = {
        row.asset_id: row.asset_name for row in session.execute(select(Asset.asset_id, Asset.asset_name)).all()
    }

    # Reported at the precision the readings themselves carry, so the device
    # named as the highest consumer cannot appear lower than another once both
    # are rounded for display.
    ranked = sorted(today.items(), key=lambda item: item[1], reverse=True)
    highest = (
        {"asset_id": ranked[0][0], "asset_name": names.get(ranked[0][0], ranked[0][0]), "kwh": round(ranked[0][1], 4)}
        if ranked
        else None
    )
    lowest = (
        {"asset_id": ranked[-1][0], "asset_name": names.get(ranked[-1][0], ranked[-1][0]), "kwh": round(ranked[-1][1], 4)}
        if ranked
        else None
    )

    # Busiest hour of the day by mean estate draw.
    hourly = session.execute(
        select(
            func.date_trunc("hour", Telemetry.ts).label("hour"),
            func.avg(Telemetry.active_power).label("watts"),
        )
        .where(Telemetry.ts >= midnight, Telemetry.ts < stamp + timedelta(seconds=1))
        .group_by("hour")
        .order_by(func.avg(Telemetry.active_power).desc())
        .limit(1)
    ).first()

    daily = session.execute(
        select(
            func.date_trunc("day", Telemetry.ts).label("day"),
            (func.max(Telemetry.energy_kwh) - func.min(Telemetry.energy_kwh)).label("kwh"),
            Telemetry.asset_id,
        )
        .where(Telemetry.ts >= stamp - timedelta(days=14))
        .group_by("day", Telemetry.asset_id)
    ).all()

    per_day: dict[datetime, float] = {}
    for row in daily:
        per_day[row.day] = per_day.get(row.day, 0.0) + float(row.kwh or 0.0)

    trend = [
        {"date": day, "label": day.strftime("%d %b"), "kwh": round(value, 4)}
        for day, value in sorted(per_day.items())
    ]

    monthly_total = round(sum(monthly.values()), 4)

    return {
        "today_kwh": today_total,
        "yesterday_kwh": yesterday_total,
        "change_pct": change,
        "weekly_kwh": round(sum(weekly.values()), 4),
        "monthly_kwh": monthly_total,
        "peak_hour": int(hourly.hour.hour) if hourly else None,
        "peak_kw": round(float(hourly.watts or 0.0) / 1000.0 * len(engine.simulator.states), 4)
        if hourly
        else 0.0,
        "highest_consumer": highest,
        "lowest_consumer": lowest,
        "tariff_per_kwh": TARIFF_PER_KWH,
        "currency": CURRENCY,
        "estimated_monthly_cost": round(monthly_total * TARIFF_PER_KWH, 2),
        "carbon_kg_per_month": round(monthly_total * CARBON_KG_PER_KWH, 2),
        "daily_trend": trend,
    }


def yesterday_baseline(session: Session, engine: InteloraEngine, now: datetime | None = None) -> dict:
    """Prior-day figures behind every cockpit comparison.

    Read from stored history rather than invented at render time, so the arrow
    on a KPI card is a comparison with something that was actually recorded.
    """
    stamp = now or datetime.now(timezone.utc)
    midnight = stamp.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight - timedelta(days=1)

    health_rows = session.execute(
        select(Telemetry.asset_id, func.avg(Telemetry.health_score).label("health"))
        .where(Telemetry.ts >= start, Telemetry.ts < midnight)
        .group_by(Telemetry.asset_id)
    ).all()

    healths = [float(row.health or 0.0) for row in health_rows]
    bands = [band_of(value) for value in healths]

    offline = session.execute(
        select(func.count())
        .select_from(Telemetry)
        .where(Telemetry.ts >= start, Telemetry.ts < midnight, Telemetry.device_status == "Offline")
    ).scalar_one()

    fleet_oee = session.execute(
        select(func.avg(Oee.oee))
        .where(Oee.scope == "fleet", Oee.computed_at >= start, Oee.computed_at < midnight)
    ).scalar()

    power = session.execute(
        select(func.avg(Telemetry.active_power))
        .where(Telemetry.ts >= start, Telemetry.ts < midnight)
    ).scalar()

    energy = _window_energy(session, start, midnight)

    average_health = round(sum(healths) / len(healths), 1) if healths else 0.0
    kpis = engine.analytics.kpis

    return {
        "average_health": average_health,
        "healthy_assets": bands.count("healthy"),
        "good_assets": bands.count("good"),
        "warning_assets": bands.count("warning"),
        "critical_assets": bands.count("critical"),
        # A device is counted as having been unreachable yesterday if any sample
        # in the window reported it dark.
        "offline_samples": int(offline or 0),
        "energy_kwh": round(sum(energy.values()), 4),
        "average_power_w": round(float(power or 0.0), 2),
        "oee": round(float(fleet_oee), 1) if fleet_oee is not None else float(kpis.get("average_oee", 0.0)),
        "operational_health": average_health,
        "observed": bool(healths),
    }


def fleet_trail(
    session: Session,
    engine: InteloraEngine,
    now: datetime | None = None,
    points: int = 48,
    bucket_minutes: int = 15,
) -> list[dict]:
    """Estate condition, draw and effectiveness over a rolling window.

    Health and power are aggregated from stored telemetry; effectiveness comes
    from the fleet rows the analytics pass wrote, so every point on the trend is
    a figure the platform actually published at that time rather than today's
    model applied to yesterday's readings. Buckets with no effectiveness
    snapshot carry the last one forward, which is what the value was between
    passes.
    """
    stamp = now or datetime.now(timezone.utc)
    start = stamp - timedelta(minutes=points * bucket_minutes)
    width = f"{bucket_minutes} minutes"

    bucket = func.date_bin(text(f"interval '{width}'"), Telemetry.ts, start).label("bucket")
    rows = session.execute(
        select(
            bucket,
            func.avg(Telemetry.health_score).label("health"),
            func.sum(Telemetry.active_power).label("power"),
            func.count(func.distinct(Telemetry.asset_id)).label("devices"),
            func.count().label("samples"),
        )
        .where(Telemetry.ts >= start, Telemetry.ts <= stamp)
        .group_by(bucket)
        .order_by(bucket)
    ).all()

    oee_bucket = func.date_bin(text(f"interval '{width}'"), Oee.computed_at, start).label("bucket")
    oee_rows = session.execute(
        select(oee_bucket, func.avg(Oee.oee).label("oee"))
        .where(Oee.scope == "fleet", Oee.computed_at >= start, Oee.computed_at <= stamp)
        .group_by(oee_bucket)
        .order_by(oee_bucket)
    ).all()
    by_bucket = {row.bucket: float(row.oee or 0.0) for row in oee_rows}

    trail: list[dict] = []
    carried = float(engine.analytics.fleet_oee.get("oee", 0.0))

    for row in rows:
        samples = int(row.samples or 0)
        devices = max(1, int(row.devices or 1))
        carried = by_bucket.get(row.bucket, carried)

        trail.append(
            {
                "t": row.bucket,
                "label": row.bucket.strftime("%H:%M"),
                "health": round(float(row.health or 0.0), 1),
                # Instantaneous estate draw, not the sum of every sample in the
                # window — that would scale with how densely the bucket was
                # sampled rather than with what the estate was drawing.
                "power": round(float(row.power or 0.0) / max(1, samples) * devices, 2),
                "oee": round(carried, 1),
            }
        )

    return trail


def activity_feed(engine: InteloraEngine, limit: int = 25) -> list[dict]:
    """Platform journal — what happened, newest first.

    Assembled from events the platform actually recorded: exceptions raised and
    cleared, and endpoints that went dark or came back.
    """
    entries: list[dict] = []

    for event in engine.detector.journal:
        entries.append(
            {
                "id": f"{event.uid}-raised",
                "kind": "alert-generated",
                "title": f"{event.title} raised",
                "detail": f"{event.error_code} on {event.asset_name}: "
                f"{event.observed_value} against {event.threshold_value} {event.unit}".strip(),
                "at": event.detected_at,
                "asset_id": event.asset_id,
                "severity": event.severity,
            }
        )
        if event.resolved_at is not None:
            entries.append(
                {
                    "id": f"{event.uid}-cleared",
                    "kind": "alert-cleared",
                    "title": f"{event.title} cleared",
                    "detail": f"{event.asset_name} returned inside its limit after "
                    f"{event.minutes_open(event.resolved_at):.1f} minutes",
                    "at": event.resolved_at,
                    "asset_id": event.asset_id,
                    "severity": "Info",
                }
            )

    for state in engine.simulator.states.values():
        if state.device_status == "Offline" and state.history:
            entries.append(
                {
                    "id": f"{state.asset_id}-offline-{int(state.elapsed_seconds)}",
                    "kind": "asset-offline",
                    "title": "Endpoint unreachable",
                    "detail": f"{state.seed.asset_name} stopped publishing telemetry",
                    "at": state.history[-1].ts,
                    "asset_id": state.asset_id,
                    "severity": "Critical",
                }
            )

    return sorted(entries, key=lambda entry: entry["at"], reverse=True)[:limit]
