"""The upstream boundary.

Every figure APM reads from another module passes through this file, and nothing
else in the package touches `engine.detector` or `engine.analytics.predictions`
directly. One seam, one place to look when asking "where does APM get this from".

Two of the fields the APM specification requires do not exist upstream yet:

    scenario_id        AD names an anomaly *type* and assigns an error code, but
                       does not group events into a named scenario
    degradation_score  PdM publishes wear, health, RUL and failure probability,
                       but no separate normalised degradation figure

Those two are **derived here and labelled as derived**. Every other field is a
straight pass-through of what the owning module computed.

The labelling is the point. A consumer that cannot tell a real upstream figure
from one APM synthesised on its behalf will eventually treat the synthetic one as
ground truth, and the first person to notice will be whoever tries to reconcile it
against AD's own output. So each field carries its provenance, and
`/apm/upstream/contract` publishes the whole map — what is real, what is derived,
and what the derivation is.

When AD adds scenarios and PdM adds a degradation score, the fix is to change
`_scenario_of` and `_degradation_of` to read the real field and flip its
provenance to "upstream". No consumer changes, because no consumer is written
against the derivation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.mock_data.signals import clamp01
from app.services.anomaly_service import AnomalyEvent
from app.services.derive import band_of

#: Provenance of a published field.
#:
#:   upstream  the owning module computed it; APM passes it through untouched
#:   derived   the owning module does not publish it yet, so APM derives it here
PROVENANCE_UPSTREAM = "upstream"
PROVENANCE_DERIVED = "derived"


# ── Scenarios ────────────────────────────────────────────────────────────
#
# A scenario is the failure *story* a group of anomaly types tells. AD raises
# individual breaches; grouping them is a judgement about what they mean together,
# and until AD makes that judgement itself APM makes it here from the anomaly
# types AD already publishes.

SCENARIOS: dict[str, dict[str, str]] = {
    "SCN-THERMAL": {
        "scenario_id": "SCN-THERMAL",
        "name": "Thermal stress",
        "detail": "Temperature at or beyond the device ceiling, with cooling implicated.",
    },
    "SCN-SUPPLY": {
        "scenario_id": "SCN-SUPPLY",
        "name": "Supply quality",
        "detail": "Voltage or frequency outside tolerance at the device input.",
    },
    "SCN-LOAD": {
        "scenario_id": "SCN-LOAD",
        "name": "Load abnormality",
        "detail": "Current or power beyond the rating for this device class.",
    },
    "SCN-EFFICIENCY": {
        "scenario_id": "SCN-EFFICIENCY",
        "name": "Efficiency loss",
        "detail": "Power factor or energy consumption degraded against the device's own baseline.",
    },
    "SCN-CONNECTIVITY": {
        "scenario_id": "SCN-CONNECTIVITY",
        "name": "Connectivity loss",
        "detail": "The device stopped reporting; its condition cannot be observed.",
    },
    "SCN-NONE": {
        "scenario_id": "SCN-NONE",
        "name": "No active scenario",
        "detail": "No open anomaly on this asset.",
    },
}

#: Which scenario each AD anomaly type belongs to.
_SCENARIO_OF_TYPE: dict[str, str] = {
    "temperature-high": "SCN-THERMAL",
    "voltage-high": "SCN-SUPPLY",
    "voltage-low": "SCN-SUPPLY",
    "frequency-deviation": "SCN-SUPPLY",
    "current-spike": "SCN-LOAD",
    "power-surge": "SCN-LOAD",
    "power-factor-low": "SCN-EFFICIENCY",
    "energy-spike": "SCN-EFFICIENCY",
    "communication-lost": "SCN-CONNECTIVITY",
}

#: Ranked worst-first. When an asset has several open anomalies it has several
#: scenarios, and the one reported as primary is the one that would be worked
#: first — an unreachable device outranks a poor power factor.
_SCENARIO_RANK: tuple[str, ...] = (
    "SCN-CONNECTIVITY",
    "SCN-THERMAL",
    "SCN-LOAD",
    "SCN-SUPPLY",
    "SCN-EFFICIENCY",
)


def _scenario_of(events: list[AnomalyEvent]) -> tuple[str, list[str]]:
    """Primary scenario and every scenario currently in play for one asset.

    Derived from AD's anomaly types. Replace with AD's own scenario id when it
    publishes one.
    """
    present = {
        _SCENARIO_OF_TYPE.get(event.anomaly_type, "SCN-NONE")
        for event in events
        if event.resolved_at is None
    }
    present.discard("SCN-NONE")

    if not present:
        return "SCN-NONE", []

    for candidate in _SCENARIO_RANK:
        if candidate in present:
            return candidate, sorted(present)
    return "SCN-NONE", sorted(present)


# ── Degradation ──────────────────────────────────────────────────────────


def _degradation_of(health_score: float, wear: float, failure_probability: float) -> float:
    """A 0–1 degradation score.

    Derived from PdM's own outputs, deliberately *not* from telemetry: deriving it
    from readings would make APM a second condition estimator, which is precisely
    the duplication the module boundary exists to prevent.

    Health carries the most weight because it is PdM's headline condition figure;
    wear anchors it to the physical part, and failure probability tilts it for an
    asset that is close to the boundary despite a still-acceptable health score.

    Replace with PdM's own degradation score when it publishes one.
    """
    condition_loss = clamp01(1.0 - health_score / 100.0)
    return round(
        clamp01(0.55 * condition_loss + 0.30 * clamp01(wear) + 0.15 * clamp01(failure_probability)),
        4,
    )


# ── Published shapes ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class AnomalyDetectionInputs:
    """What APM consumes from Anomaly Detection."""

    asset_id: str
    #: Highest anomaly score among open events. Upstream.
    anomaly_score: float
    #: Highest open severity, or None when nothing is open. Upstream.
    severity: str | None
    #: Detector confidence on the highest-severity open event. Upstream.
    confidence: float
    #: Derived by APM from AD's anomaly types.
    scenario_id: str
    scenario_name: str
    scenario_detail: str
    #: Every scenario in play, worst first.
    active_scenarios: list[str]
    #: Upstream.
    device_status: str
    open_by_severity: dict[str, int]
    open_total: int
    anomalies_24h: int

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "anomaly_score": self.anomaly_score,
            "severity": self.severity,
            "confidence": self.confidence,
            "scenario_id": self.scenario_id,
            "scenario_name": self.scenario_name,
            "scenario_detail": self.scenario_detail,
            "active_scenarios": list(self.active_scenarios),
            "device_status": self.device_status,
            "open_by_severity": dict(self.open_by_severity),
            "open_total": self.open_total,
            "anomalies_24h": self.anomalies_24h,
        }


@dataclass(frozen=True)
class PredictiveInputs:
    """What APM consumes from Predictive Maintenance."""

    asset_id: str
    #: Upstream.
    health_score: float
    health_band: str
    #: Upstream.
    remaining_useful_life_days: float
    #: Upstream.
    failure_probability: float
    #: Upstream — the component PdM expects to fail first.
    failure_mode: str
    #: Upstream.
    prediction_confidence: float
    #: Derived by APM from health, wear and failure probability.
    degradation_score: float
    #: Upstream — per-component wear, which the cost and lifecycle models read.
    component_wear: list[tuple[str, float]] = field(default_factory=list)
    component_life_days: list[tuple[str, float, float]] = field(default_factory=list)
    #: Upstream — which estimator produced the figures.
    model_version: str = "unavailable"

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "health_score": self.health_score,
            "health_band": self.health_band,
            "remaining_useful_life_days": self.remaining_useful_life_days,
            "failure_probability": self.failure_probability,
            "failure_mode": self.failure_mode,
            "prediction_confidence": self.prediction_confidence,
            "degradation_score": self.degradation_score,
            "model_version": self.model_version,
            "components": [
                {"name": name, "wear": round(wear, 5)} for name, wear in self.component_wear
            ],
        }


@dataclass(frozen=True)
class PlatformCoreInputs:
    """What APM consumes from Platform Core. All upstream, all measured."""

    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    status: str
    device_uid: str
    assigned_criticality: str
    duty_factor: float

    active_power: float
    active_energy_kwh: float
    relay_status: str
    relay_operations: int
    temperature: float
    runtime_hours: float
    power_factor: float
    uptime_ratio: float
    observed_seconds: float
    online_seconds: float
    timestamp: datetime | None

    rated_power_w: float
    max_temperature_c: float
    nominal_voltage_v: float
    max_current_a: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "category": self.category,
            "brand": self.brand,
            "model": self.model,
            "status": self.status,
            "device_uid": self.device_uid,
            "assigned_criticality": self.assigned_criticality,
            "duty_factor": self.duty_factor,
            "active_power": round(self.active_power, 2),
            "active_energy_kwh": round(self.active_energy_kwh, 5),
            "relay_status": self.relay_status,
            "relay_operations": self.relay_operations,
            "temperature": round(self.temperature, 2),
            "runtime_hours": round(self.runtime_hours, 3),
            "power_factor": round(self.power_factor, 4),
            "uptime_ratio": round(self.uptime_ratio, 5),
            "timestamp": self.timestamp,
            "rated_power_w": self.rated_power_w,
            "max_temperature_c": self.max_temperature_c,
        }


@dataclass(frozen=True)
class UpstreamBundle:
    """Everything APM consumed for one asset, in one object."""

    platform: PlatformCoreInputs
    anomaly: AnomalyDetectionInputs
    predictive: PredictiveInputs

    def as_dict(self) -> dict:
        return {
            "platform_core": self.platform.as_dict(),
            "anomaly_detection": self.anomaly.as_dict(),
            "predictive": self.predictive.as_dict(),
        }


# ── Readers ──────────────────────────────────────────────────────────────

#: Severity ordering, so "highest open severity" is well defined.
_SEVERITY_RANK: dict[str, int] = {"Critical": 4, "Major": 3, "Warning": 2, "Info": 1}


def read_anomaly_detection(
    asset_id: str,
    events: list[AnomalyEvent],
    open_by_severity: dict[str, int],
    anomalies_24h: int,
    device_status: str,
) -> AnomalyDetectionInputs:
    """AD's outputs for one asset."""
    open_events = [event for event in events if event.resolved_at is None]

    worst = max(open_events, key=lambda e: _SEVERITY_RANK.get(e.severity, 0), default=None)
    scenario_id, active = _scenario_of(events)
    scenario = SCENARIOS[scenario_id]

    return AnomalyDetectionInputs(
        asset_id=asset_id,
        anomaly_score=round(max((e.anomaly_score for e in open_events), default=0.0), 4),
        severity=worst.severity if worst is not None else None,
        confidence=round(worst.confidence, 3) if worst is not None else 0.0,
        scenario_id=scenario_id,
        scenario_name=scenario["name"],
        scenario_detail=scenario["detail"],
        active_scenarios=active,
        device_status=device_status,
        open_by_severity=dict(open_by_severity),
        open_total=sum(open_by_severity.values()),
        anomalies_24h=anomalies_24h,
    )


def read_predictive(asset_id: str, prediction, state) -> PredictiveInputs:
    """PdM's outputs for one asset.

    Tolerates a missing prediction: the analytics pass may not have run for a
    newly registered asset, and APM should report that it has no prognostic input
    rather than fail the whole estate pass for one record.
    """
    component_wear = [
        (spec.name, state.wear[index] if index < len(state.wear) else 0.0)
        for index, spec in enumerate(state.profile.components)
    ]
    component_life = [
        (spec.name, state.wear[index] if index < len(state.wear) else 0.0, spec.expected_life_days)
        for index, spec in enumerate(state.profile.components)
    ]
    worst_wear = max((wear for _name, wear in component_wear), default=0.0)

    if prediction is None:
        return PredictiveInputs(
            asset_id=asset_id,
            health_score=state.health,
            health_band=band_of(state.health),
            remaining_useful_life_days=0.0,
            failure_probability=0.0,
            failure_mode="unavailable",
            prediction_confidence=0.0,
            degradation_score=_degradation_of(state.health, worst_wear, 0.0),
            component_wear=component_wear,
            component_life_days=component_life,
            model_version="unavailable",
        )

    primary = prediction.primary

    return PredictiveInputs(
        asset_id=asset_id,
        health_score=state.health,
        health_band=band_of(state.health),
        remaining_useful_life_days=primary.rul_days,
        failure_probability=primary.failure_probability,
        failure_mode=primary.component,
        prediction_confidence=primary.confidence,
        degradation_score=_degradation_of(
            state.health, worst_wear, primary.failure_probability
        ),
        component_wear=component_wear,
        component_life_days=component_life,
        model_version=getattr(primary, "model_version", "unavailable"),
    )


def read_platform_core(state) -> PlatformCoreInputs:
    """Platform Core's register and meters for one asset."""
    seed = state.seed
    latest = state.history[-1] if state.history else None

    return PlatformCoreInputs(
        asset_id=state.asset_id,
        asset_name=seed.asset_name,
        category=seed.category,
        brand=seed.brand,
        model=seed.model,
        status=state.device_status,
        device_uid=state.device_uid,
        assigned_criticality=seed.criticality,
        duty_factor=seed.duty_factor,
        active_power=state.active_power,
        active_energy_kwh=state.energy_kwh,
        relay_status=state.relay_status,
        relay_operations=state.relay_operations,
        temperature=state.temperature,
        runtime_hours=state.runtime_hours,
        power_factor=state.power_factor,
        uptime_ratio=state.uptime_ratio,
        observed_seconds=state.observed_seconds,
        online_seconds=state.online_seconds,
        timestamp=latest.ts if latest is not None else None,
        rated_power_w=state.profile.rated_power_w,
        max_temperature_c=state.profile.max_temperature_c,
        nominal_voltage_v=state.profile.nominal_voltage,
        max_current_a=state.profile.max_current_a,
    )


# ── Contract ─────────────────────────────────────────────────────────────

#: Published at `/apm/upstream/contract`. The honest answer to "where did this
#: number come from", field by field.
UPSTREAM_CONTRACT: dict = {
    "anomaly_detection": {
        "owner": "Anomaly Detection",
        "fields": {
            "anomaly_score": {"provenance": PROVENANCE_UPSTREAM},
            "severity": {"provenance": PROVENANCE_UPSTREAM},
            "confidence": {"provenance": PROVENANCE_UPSTREAM},
            "scenario_id": {
                "provenance": PROVENANCE_DERIVED,
                "derivation": (
                    "AD publishes an anomaly type and error code per event but does not group "
                    "events into named scenarios. APM maps each anomaly type onto one of five "
                    "scenarios and reports the worst one in play. Replace with AD's own scenario "
                    "id when it publishes one."
                ),
            },
        },
    },
    "predictive_maintenance": {
        "owner": "Predictive Maintenance",
        "fields": {
            "health_score": {"provenance": PROVENANCE_UPSTREAM},
            "remaining_useful_life": {"provenance": PROVENANCE_UPSTREAM},
            "failure_probability": {"provenance": PROVENANCE_UPSTREAM},
            "prediction_confidence": {"provenance": PROVENANCE_UPSTREAM},
            "failure_mode": {"provenance": PROVENANCE_UPSTREAM},
            "degradation_score": {
                "provenance": PROVENANCE_DERIVED,
                "derivation": (
                    "PdM publishes wear, health, RUL and failure probability but no separate "
                    "normalised degradation figure. APM derives it as "
                    "0.55*(1-health/100) + 0.30*worst_component_wear + 0.15*failure_probability. "
                    "Derived from PdM's outputs only, never from telemetry, so APM does not become "
                    "a second condition estimator. Replace with PdM's own score when it publishes one."
                ),
            },
        },
    },
    "platform_core": {
        "owner": "Platform Core",
        "fields": {
            name: {"provenance": PROVENANCE_UPSTREAM}
            for name in (
                "asset_registry",
                "device_registry",
                "asset_hierarchy",
                "active_power",
                "active_energy",
                "relay_status",
                "temperature",
                "runtime",
                "duty_cycle",
                "timestamp",
                "power_factor",
            )
        },
    },
    "note": (
        "APM implements no anomaly detection and no remaining-life prediction. Every field marked "
        "'upstream' is passed through untouched from the module that owns it. Every field marked "
        "'derived' is one the specification requires of APM but the owning module does not publish "
        "yet, and its derivation is stated above."
    ),
}
