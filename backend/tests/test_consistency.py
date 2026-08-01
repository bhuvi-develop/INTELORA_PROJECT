"""Cross-module consistency.

The platform's central promise is that no two modules report conflicting values
for the same device. That holds structurally — wear is the only mutable state and
everything else is a pure function of it — but structure is a claim until it is
tested, so this exercise takes the most degraded device in the estate, ages it,
and asserts that every dependent figure moved the way it must.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.derive import band_of, oee_of
from app.services.engine import InteloraEngine


def advance(engine: InteloraEngine, ticks: int, wear_scale: float = 400.0) -> None:
    for _ in range(ticks):
        engine.step(1.0)
        # Age faster than wall time so a test that runs in seconds still
        # observes degradation the platform would take days to produce.
        for state in engine.simulator.states.values():
            engine.simulator._accrue_wear(state, 1.0, wear_scale)


def test_health_is_the_same_everywhere():
    engine = InteloraEngine()
    advance(engine, 200)
    analytics = engine.refresh_analytics()

    for asset_id, state in engine.simulator.states.items():
        performance = analytics.performance[asset_id]
        view = engine.asset_view(asset_id)

        assert performance.health_score == state.health
        assert view["health_score"] == state.health
        assert view["health_band"] == band_of(state.health)
        assert performance.health_band == band_of(state.health)
        assert state.history[-1].health_score == state.health


def test_kpis_agree_with_the_asset_list():
    engine = InteloraEngine()
    advance(engine, 120)
    analytics = engine.refresh_analytics()
    kpis = analytics.kpis

    states = list(engine.simulator.states.values())
    assert kpis["total_assets"] == len(states)
    assert kpis["online_assets"] == sum(1 for s in states if s.device_status == "Online")
    assert kpis["offline_assets"] == sum(1 for s in states if s.device_status == "Offline")
    assert kpis["critical_assets"] == sum(1 for s in states if band_of(s.health) == "critical")

    band_total = (
        kpis["healthy_assets"] + kpis["good_assets"] + kpis["warning_assets"] + kpis["critical_assets"]
    )
    assert band_total == kpis["total_assets"], "band counts must partition the estate"

    mean = round(sum(s.health for s in states) / len(states), 1)
    assert abs(kpis["average_health"] - mean) < 0.05


def test_oee_is_the_product_of_its_own_factors():
    engine = InteloraEngine()
    advance(engine, 150)
    analytics = engine.refresh_analytics()

    for entry in analytics.performance.values():
        expected = oee_of(entry.availability, entry.performance, entry.quality)
        assert abs(entry.oee - expected) < 0.05, f"{entry.asset_id} OEE does not match its factors"


def test_degradation_moves_every_dependent_figure():
    """Age the weakest device and follow the consequences through every module."""
    engine = InteloraEngine()
    advance(engine, 60)
    before = engine.refresh_analytics()

    target = min(before.performance.values(), key=lambda entry: entry.health_score)
    asset_id = target.asset_id

    health_before = target.health_score
    oee_before = target.oee
    rul_before = before.predictions[asset_id].primary.rul_days
    probability_before = before.predictions[asset_id].primary.failure_probability
    rank_before = next(row["rank"] for row in before.ranking if row["asset_id"] == asset_id)

    # Age the whole estate hard, then compare.
    advance(engine, 400, wear_scale=6000.0)
    after = engine.refresh_analytics()

    health_after = after.performance[asset_id].health_score
    oee_after = after.performance[asset_id].oee
    rul_after = after.predictions[asset_id].primary.rul_days
    probability_after = after.predictions[asset_id].primary.failure_probability
    rank_after = next(row["rank"] for row in after.ranking if row["asset_id"] == asset_id)

    assert health_after < health_before, "health must fall as wear accrues"
    assert oee_after <= oee_before, "effectiveness must not rise while condition falls"
    assert rul_after <= rul_before, "remaining life must never extend"
    assert probability_after >= probability_before, "failure probability must never fall"
    assert rank_after >= rank_before, "a degrading asset must not climb the ranking"

    view = engine.asset_view(asset_id)
    assert view["health_score"] == health_after
    assert view["prediction"].primary.rul_days == rul_after


def test_predictions_never_improve_across_refreshes():
    engine = InteloraEngine()
    advance(engine, 80)

    first = engine.refresh_analytics()
    baseline = {
        (asset_id, component.component): (component.rul_days, component.failure_probability)
        for asset_id, prediction in first.predictions.items()
        for component in prediction.components
    }

    advance(engine, 300, wear_scale=3000.0)
    second = engine.refresh_analytics()

    for asset_id, prediction in second.predictions.items():
        for component in prediction.components:
            rul_before, probability_before = baseline[(asset_id, component.component)]
            assert component.rul_days <= rul_before + 1e-6, (
                f"{asset_id}/{component.component} remaining life extended"
            )
            assert component.failure_probability >= probability_before - 1e-9, (
                f"{asset_id}/{component.component} failure probability fell"
            )


def test_open_anomaly_counts_agree():
    engine = InteloraEngine()
    advance(engine, 600, wear_scale=1.0)
    engine.refresh_analytics()

    kpis = engine.analytics.kpis
    open_events = engine.detector.open_events()

    assert kpis["active_anomalies"] == len(open_events)
    assert kpis["critical_anomalies"] == sum(1 for e in open_events if e.severity == "Critical")

    per_asset = sum(
        len(engine.detector.active_by_asset(asset_id)) for asset_id in engine.simulator.states
    )
    assert per_asset == len(open_events), "per-asset counts must sum to the estate total"

    breakdown = engine.severity_breakdown()
    assert sum(breakdown.values()) == len(open_events)


def test_risk_distribution_partitions_the_estate():
    engine = InteloraEngine()
    advance(engine, 100)
    engine.refresh_analytics()

    distribution = engine.risk_distribution()
    assert sum(entry["count"] for entry in distribution) == len(engine.simulator.states)


def test_anomalies_are_only_raised_on_real_breaches():
    """Never generate an impossible anomaly."""
    engine = InteloraEngine()
    advance(engine, 900, wear_scale=1.0)

    for event in engine.detector.journal:
        if event.anomaly_type == "communication-lost":
            continue

        threshold = event.threshold_value
        observed = event.observed_value

        if event.anomaly_type in ("voltage-low", "power-factor-low"):
            assert observed < threshold, f"{event.error_code} raised without a low breach"
        elif event.anomaly_type == "frequency-deviation":
            assert abs(observed - threshold) > 0.5
        else:
            assert observed > threshold, f"{event.error_code} raised without a high breach"

        assert event.severity in ("Critical", "Major", "Warning", "Info")
        assert 0.0 <= event.anomaly_score <= 1.0
        # The simulated clock advances one second per step, which a test drives
        # far faster than wall time, so an event may legitimately carry a
        # timestamp ahead of now. What it may never do is predate the engine.
        assert event.detected_at >= engine.started_at


def test_offline_devices_raise_only_communication_loss():
    engine = InteloraEngine()
    advance(engine, 1200, wear_scale=1.0)

    for event in engine.detector.journal:
        state = engine.simulator.states[event.asset_id]
        if state.device_status != "Offline":
            continue
        open_types = {e.anomaly_type for e in engine.detector.active_by_asset(event.asset_id)}
        assert open_types <= {"communication-lost"}, (
            f"{event.asset_id} is offline but carries electrical anomalies {open_types}"
        )
