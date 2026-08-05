"""AI insight generation.

Written as an operations manager would write them: what the estate is doing,
what it means commercially, and what to do next. Every sentence is assembled
from figures the platform has actually computed — asset counts, health means,
open severities, remaining life, effectiveness losses — so an insight can never
claim something the dashboard contradicts.

This is deliberately not a language model. The value here is that the narrative
and the numbers are the same object.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.derive import OEE_TARGET
from app.services.engine import InteloraEngine


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return singular if count == 1 else (plural or f"{singular}s")


def cockpit_insight(engine: InteloraEngine) -> dict:
    # Read the same live block the dashboard publishes, so the narrative and the
    # cards beside it quote identical numbers.
    kpis = engine.live_kpis()
    total = max(1, int(kpis.get("total_assets", 0)))

    critical = int(kpis.get("critical_assets", 0))
    warning = int(kpis.get("warning_assets", 0))
    offline = int(kpis.get("offline_assets", 0))
    open_alerts = int(kpis.get("active_anomalies", 0))
    critical_alerts = int(kpis.get("critical_anomalies", 0))
    health = float(kpis.get("average_health", 0.0))
    operational = float(kpis.get("operational_health", 0.0))
    effectiveness = float(kpis.get("average_oee", 0.0))

    worst = engine.worst_assets(1)
    weakest = worst[0] if worst else None

    if critical > 0 or critical_alerts > 0:
        severity, headline = "Critical", "Estate carrying critical condition"
    elif warning > 0 or open_alerts > 0:
        severity, headline = "Warning", "Estate serviceable with open exceptions"
    else:
        severity, headline = "Info", "Estate operating within every limit"

    summary = (
        f"Operational health is {operational:.1f} across {total} commissioned "
        f"{_plural(total, 'device')}, with a mean condition of {health:.1f}%. "
        f"{kpis.get('online_assets', 0)} {_plural(int(kpis.get('online_assets', 0)), 'device is', 'devices are')} "
        f"reporting, {offline} {_plural(offline, 'is', 'are')} unreachable, and {open_alerts} "
        f"{_plural(open_alerts, 'exception is', 'exceptions are')} open of which {critical_alerts} "
        f"{_plural(critical_alerts, 'is', 'are')} critical."
    )

    if weakest is not None:
        summary += (
            f" The weakest unit is {weakest['asset_name']} ({weakest['asset_id']}) at "
            f"{weakest['health_score']:.1f}% and {weakest['risk_tier']} risk."
        )

    if critical_alerts > 0:
        recommendation = (
            f"Clear the {critical_alerts} critical {_plural(critical_alerts, 'exception')} before anything else; "
            "each one is a device operating outside the envelope it was rated for."
        )
    elif offline > 0:
        recommendation = (
            f"Restore the {offline} unreachable {_plural(offline, 'device')}. Their condition cannot be "
            "assessed while they are dark, so any developing fault on them is invisible."
        )
    elif warning > 0:
        recommendation = (
            f"Schedule the {warning} {_plural(warning, 'device')} in the warning band into the next service "
            "window; intervening now is cheaper than the unplanned outage it prevents."
        )
    else:
        recommendation = "No intervention is justified. Continue routine monitoring."

    gap = OEE_TARGET - effectiveness
    business_impact = (
        f"Effectiveness averages {effectiveness:.1f}% against a {OEE_TARGET:.0f}% target, "
        + (
            f"a shortfall of {gap:.1f} points that is being paid for in availability and throughput."
            if gap > 0
            else "which is at or above target."
        )
        + f" {int(kpis.get('assets_at_risk', 0))} {_plural(int(kpis.get('assets_at_risk', 0)), 'device is', 'devices are')} "
        "at high or critical risk and represent the estate's exposure to unplanned failure."
    )

    return _insight(
        module="cockpit",
        headline=headline,
        summary=summary,
        recommendation=recommendation,
        business_impact=business_impact,
        severity=severity,
        confidence=0.9,
    )


def anomaly_insight(engine: InteloraEngine) -> dict:
    open_events = engine.detector.open_events()
    journal = engine.detector.journal
    breakdown = engine.severity_breakdown()

    by_type: dict[str, int] = {}
    for event in journal:
        by_type[event.title] = by_type.get(event.title, 0) + 1
    dominant = max(by_type.items(), key=lambda item: item[1]) if by_type else None

    affected = {event.asset_id for event in open_events}
    corroborated = sum(1 for event in open_events if event.anomaly_score >= 0.6)

    if breakdown["Critical"] > 0:
        severity, headline = "Critical", "Critical exceptions open on the estate"
    elif open_events:
        severity, headline = "Warning", "Exceptions open and under investigation"
    else:
        severity, headline = "Info", "No exceptions currently open"

    summary = (
        f"{len(journal)} {_plural(len(journal), 'event')} have been raised this session and "
        f"{len(open_events)} {_plural(len(open_events), 'remains', 'remain')} open across "
        f"{len(affected)} {_plural(len(affected), 'device')}. "
        f"Severity splits {breakdown['Critical']} critical, {breakdown['Major']} major, "
        f"{breakdown['Warning']} warning."
    )
    if dominant is not None:
        summary += f" The most frequent signature is {dominant[0].lower()} at {dominant[1]} occurrences."
    if corroborated:
        summary += (
            f" {corroborated} open {_plural(corroborated, 'event is', 'events are')} also flagged by the "
            "isolation forest as unlike anything this device normally produces."
        )

    if breakdown["Critical"] > 0:
        recommendation = (
            "Work the critical queue first. A breach above 18% of the limit is not a tolerance issue; "
            "it is the device operating somewhere it was never rated to."
        )
    elif dominant is not None and dominant[1] >= 3:
        recommendation = (
            f"{dominant[0]} is recurring rather than isolated. Address what is producing it — acknowledging "
            "each occurrence does not stop the next one."
        )
    else:
        recommendation = "Nothing requires escalation. The detector will raise a confirmed breach automatically."

    business_impact = (
        f"Open exceptions currently affect {len(affected)} of {len(engine.get_active_asset_ids())} devices. "
        "Each unresolved critical event reduces the estate's operational health score directly and "
        "degrades the quality factor feeding effectiveness."
    )

    return _insight(
        module="anomaly",
        headline=headline,
        summary=summary,
        recommendation=recommendation,
        business_impact=business_impact,
        severity=severity,
        confidence=0.88,
    )


def predictive_insight(engine: InteloraEngine) -> dict:
    predictions = list(engine.analytics.predictions.values())
    if not predictions:
        return _insight(
            module="predictive",
            headline="Prediction warming up",
            summary="Not enough history has accumulated to publish a remaining-life figure.",
            recommendation="Leave the stream running; predictions publish as soon as the window fills.",
            business_impact="No exposure can be quantified yet.",
            severity="Info",
            confidence=0.4,
        )

    soonest = min(predictions, key=lambda entry: entry.primary.rul_days)
    urgent = [entry for entry in predictions if entry.primary.rul_days <= 30]
    high_probability = [entry for entry in predictions if entry.primary.failure_probability >= 0.5]
    mean_rul = sum(entry.primary.rul_days for entry in predictions) / len(predictions)

    if urgent:
        severity, headline = "Critical", f"{len(urgent)} {_plural(len(urgent), 'component')} inside the 30-day horizon"
    elif high_probability:
        severity, headline = "Warning", "Failure probability rising on part of the estate"
    else:
        severity, headline = "Info", "No component is inside the prediction horizon"

    summary = (
        f"Mean remaining life across the estate is {mean_rul:.0f} days. The nearest end of life is "
        f"{soonest.primary.component.lower()} on {soonest.asset_name} at {soonest.primary.rul_days:.0f} days "
        f"and {soonest.primary.failure_probability * 100:.0f}% probability inside the horizon, published at "
        f"{soonest.primary.confidence * 100:.0f}% confidence by the {soonest.primary.model_version} model."
    )

    if urgent:
        names = ", ".join(f"{entry.asset_id} ({entry.primary.component.lower()})" for entry in urgent[:4])
        recommendation = f"Order parts and book the window for {names}."
        if len(urgent) > 4:
            recommendation += f" A further {len(urgent) - 4} components are in the same band."
    else:
        recommendation = (
            f"No parts need ordering. Re-assess when any component drops below 30 days; "
            f"the nearest is {soonest.primary.rul_days:.0f} days out."
        )

    business_impact = (
        f"{len(high_probability)} {_plural(len(high_probability), 'device')} carry a failure probability at or above "
        "50% inside the 30-day horizon. Planned replacement is materially cheaper than the unplanned outage, and "
        "the remaining-life figures only ever tighten, so these dates will not move outward."
    )

    return _insight(
        module="predictive",
        headline=headline,
        summary=summary,
        recommendation=recommendation,
        business_impact=business_impact,
        severity=severity,
        confidence=round(sum(entry.primary.confidence for entry in predictions) / len(predictions), 3),
    )


def performance_insight(engine: InteloraEngine) -> dict:
    analytics = engine.analytics
    results = list(analytics.performance.values())
    if not results:
        return _insight(
            module="apm",
            headline="Performance warming up",
            summary="No performance window has been observed yet.",
            recommendation="Leave the stream running.",
            business_impact="Not yet quantifiable.",
            severity="Info",
            confidence=0.4,
        )

    fleet = analytics.fleet_oee
    ranked = analytics.ranking
    best, worst = ranked[0], ranked[-1]
    losses = sorted(fleet["losses"], key=lambda step: step["loss"], reverse=True)
    dominant = losses[0]

    below_target = [entry for entry in results if entry.oee < OEE_TARGET]
    severity = "Warning" if len(below_target) > len(results) / 2 else "Info"

    summary = (
        f"Fleet effectiveness is {fleet['oee']:.1f}% from availability {fleet['availability']:.1f}%, "
        f"performance {fleet['performance']:.1f}% and quality {fleet['quality']:.1f}%. "
        f"{best['asset_name']} leads at {best['oee']:.1f}% and {worst['asset_name']} trails at {worst['oee']:.1f}%. "
        f"{len(below_target)} of {len(results)} devices sit below the {OEE_TARGET:.0f}% target."
    )

    recommendation = (
        f"The largest single loss is {dominant['label'].lower()} at {dominant['loss']:.1f} points — "
        f"{dominant['detail'].lower()}. Address that before the smaller arms; the cascade means every point "
        "recovered there also lifts the factors after it."
    )

    business_impact = (
        f"Closing the gap to target across the estate is worth {max(0.0, OEE_TARGET - fleet['oee']):.1f} points of "
        "effectiveness. On this estate that is capacity already paid for and not being used."
    )

    return _insight(
        module="apm",
        headline=f"Fleet effectiveness at {fleet['oee']:.1f}%",
        summary=summary,
        recommendation=recommendation,
        business_impact=business_impact,
        severity=severity,
        confidence=0.86,
    )


def build_all(engine: InteloraEngine) -> list[dict]:
    return [
        cockpit_insight(engine),
        anomaly_insight(engine),
        predictive_insight(engine),
        performance_insight(engine),
    ]


def _insight(
    *,
    module: str,
    headline: str,
    summary: str,
    recommendation: str,
    business_impact: str,
    severity: str,
    confidence: float,
    asset_id: str | None = None,
) -> dict:
    return {
        "scope": "asset" if asset_id else "fleet",
        "asset_id": asset_id,
        "module": module,
        "headline": headline,
        "summary": summary,
        "recommendation": recommendation,
        "business_impact": business_impact,
        "severity": severity,
        "confidence": confidence,
        "generated_at": datetime.now(timezone.utc),
    }
