"""The Asset Health Index.

APM's own composite, and the one figure in this module that is genuinely a
*consumer* of every upstream satellite:

    condition    PdM health score
    reliability  measured operational availability (Platform Core meters)
    alarm        AD alarm pressure — severity-weighted, not a raw count
    life         PdM remaining useful life against the adequacy horizon
    integrity    PdM failure probability inside the prediction horizon

Kept separate from the platform's health score rather than replacing it. Health
is a statement about the condition of the parts; the health index is a statement
about the asset as something the business operates, and an asset can be in good
mechanical condition while being a poor asset — unreachable half the time, or
carrying three open alarms nobody has closed. Both numbers are published, and
where they disagree the disagreement is the useful information.

Two rules the index will not break:

* An asset that is not reporting is capped, not scored. Its condition cannot be
  observed and unknown is not the same as good — the same rule the platform's
  own risk tiering already applies to an offline device.
* Every term is published alongside the composite. A single number that cannot
  be taken apart is a number nobody acts on.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.mock_data.signals import clamp, clamp01
from app.services.apm.config import (
    RUL_ADEQUACY_DAYS,
    UNOBSERVABLE_AHI_CEILING,
    ApmConfig,
    get_apm_config,
)
from app.services.derive import band_of

#: Severity weights for the alarm-pressure term. A critical alarm is not three
#: warnings; it is a different kind of event, and the gap between the weights
#: says so.
_SEVERITY_PRESSURE: dict[str, float] = {
    "Critical": 0.34,
    "Major": 0.18,
    "Warning": 0.07,
    "Info": 0.02,
}

#: Pressure contributed by each anomaly raised in the last 24 hours, on top of
#: whatever is still open. A device that raised and cleared eleven events
#: yesterday is not healthy just because none of them is open now.
_RECENT_PRESSURE = 0.035

#: Observed hours at which the index is considered fully evidenced. Below this,
#: confidence is reduced rather than the score being adjusted — a short
#: observation makes the answer less certain, not worse.
_EVIDENCE_HOURS = 24.0

#: How hard a shortfall against the availability target is punished. Availability
#: is scored against the target rather than against zero: every asset in a
#: functioning estate is above 90%, so `availability / 100` would hand the whole
#: fleet full marks on this term and stop it discriminating between assets at all.
#: At four, missing a 97% target by three points costs about an eighth of the term.
_AVAILABILITY_STRICTNESS = 4.0


def availability_term(availability_pct: float, target_pct: float) -> float:
    """0–1 satisfaction of the reliability term, scored against the target."""
    if target_pct <= 0.0:
        return clamp01(availability_pct / 100.0)
    shortfall = max(0.0, target_pct - availability_pct) / target_pct
    return clamp01(1.0 - shortfall * _AVAILABILITY_STRICTNESS)


@dataclass(frozen=True)
class HealthIndexTerm:
    key: str
    label: str
    #: 0–1 satisfaction of this term.
    value: float
    weight: float
    #: Points of the 0–100 composite this term contributed.
    contribution: float
    detail: str


@dataclass(frozen=True)
class HealthIndexResult:
    asset_id: str
    #: 0–100 composite.
    index: float
    #: The platform's own condition band, applied to the index so the interface
    #: colours it against the same boundaries it colours everything else by.
    band: str
    #: 0–1 confidence in the composite.
    confidence: float
    #: True when the score was capped because the asset is not reporting.
    capped: bool
    terms: list[HealthIndexTerm]
    #: Signed gap between the index and PdM's health score.
    #:
    #: Negative: the asset is a worse asset than its parts are — reachable and
    #: mechanically sound but carrying alarms, or unavailable. Operational work.
    #:
    #: Positive: the parts are worn but the asset is still delivering. Engineering
    #: work, and it can wait for a window.
    #:
    #: Either way the gap, not the index, is what decides which team gets it.
    condition_gap: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "health_index": self.index,
            "health_index_band": self.band,
            "confidence": self.confidence,
            "capped": self.capped,
            "condition_gap": self.condition_gap,
            "terms": [
                {
                    "key": term.key,
                    "label": term.label,
                    "value": term.value,
                    "weight": term.weight,
                    "contribution": term.contribution,
                    "detail": term.detail,
                }
                for term in self.terms
            ],
        }


def alarm_pressure(
    open_by_severity: dict[str, int],
    anomalies_24h: int,
) -> float:
    """0–1 alarm load carried by an asset.

    Open events dominate because they are unresolved; recent cleared events still
    contribute, because a device that keeps breaching limits is telling the estate
    something whether or not anyone closed the ticket.
    """
    pressure = sum(
        _SEVERITY_PRESSURE.get(severity, 0.05) * count
        for severity, count in open_by_severity.items()
    )
    pressure += _RECENT_PRESSURE * max(0, anomalies_24h)
    return clamp01(pressure)


def compute(
    asset_id: str,
    *,
    health_score: float,
    availability_pct: float,
    rul_days: float,
    failure_probability: float,
    prediction_confidence: float,
    open_by_severity: dict[str, int],
    anomalies_24h: int,
    observed_hours: float,
    is_offline: bool,
    config: ApmConfig | None = None,
) -> HealthIndexResult:
    """The Asset Health Index for one asset.

    Every argument is an output of another module. APM measures none of them and
    re-derives none of them — it weighs them.
    """
    settings = config or get_apm_config()
    weights = settings.health_index
    weight_map = weights.as_dict()

    pressure = alarm_pressure(open_by_severity, anomalies_24h)
    open_total = sum(open_by_severity.values())

    values: dict[str, tuple[float, str]] = {
        "condition": (
            clamp01(health_score / 100.0),
            f"PdM health {health_score:.1f}",
        ),
        "reliability": (
            availability_term(availability_pct, settings.targets.availability_pct),
            f"availability {availability_pct:.1f}% against a {settings.targets.availability_pct:.1f}% target",
        ),
        "alarm": (
            1.0 - pressure,
            f"{open_total} open, {anomalies_24h} raised in 24h",
        ),
        "life": (
            clamp01(rul_days / RUL_ADEQUACY_DAYS),
            f"RUL {rul_days:.0f}d against a {RUL_ADEQUACY_DAYS:.0f}d horizon",
        ),
        "integrity": (
            clamp01(1.0 - failure_probability),
            f"{failure_probability * 100:.1f}% failure probability in horizon",
        ),
    }

    terms: list[HealthIndexTerm] = []
    composite = 0.0

    for key, (value, detail) in values.items():
        weight = weight_map[key]
        contribution = weight * value * 100.0
        composite += contribution
        terms.append(
            HealthIndexTerm(
                key=key,
                label=key.replace("_", " ").capitalize(),
                value=round(value, 4),
                weight=round(weight, 4),
                contribution=round(contribution, 2),
                detail=detail,
            )
        )

    composite = clamp(composite, 0.0, 100.0)

    capped = False
    if is_offline and composite > UNOBSERVABLE_AHI_CEILING:
        composite = UNOBSERVABLE_AHI_CEILING
        capped = True

    index = round(composite, 1)

    # Confidence follows the upstream prediction and how long the asset has been
    # watched. An index built on ten minutes of observation is a guess, and says so.
    evidence = clamp01(observed_hours / _EVIDENCE_HOURS)
    confidence = clamp(0.55 + 0.30 * prediction_confidence + 0.15 * evidence, 0.4, 0.99)
    if is_offline:
        # Nothing about a dark device is well evidenced.
        confidence = min(confidence, 0.6)

    return HealthIndexResult(
        asset_id=asset_id,
        index=index,
        band=band_of(index),
        confidence=round(confidence, 3),
        capped=capped,
        terms=terms,
        condition_gap=round(index - health_score, 1),
    )


@dataclass(frozen=True)
class FleetHealthIndex:
    assets: int
    #: Unweighted mean, for comparison with the platform's mean health.
    mean_index: float
    #: Mean weighted by criticality score, which is the figure an executive
    #: should read: degradation on an A-class asset must move the estate number
    #: more than the same degradation on a D-class one.
    weighted_index: float
    band_counts: dict[str, int]
    below_floor: int
    #: Assets whose index is materially worse than their condition score, i.e.
    #: assets whose problem is operational rather than mechanical.
    operationally_impaired: int

    def as_dict(self) -> dict:
        return {
            "assets": self.assets,
            "mean_index": self.mean_index,
            "weighted_index": self.weighted_index,
            "band_counts": dict(self.band_counts),
            "below_floor": self.below_floor,
            "operationally_impaired": self.operationally_impaired,
        }


#: Condition-gap below which an asset counts as operationally impaired: its index
#: sits five or more points under its mechanical condition.
_IMPAIRMENT_GAP = -5.0


def rollup(
    results: list[HealthIndexResult],
    criticality_scores: dict[str, float],
    floor: float,
) -> FleetHealthIndex:
    if not results:
        return FleetHealthIndex(
            assets=0,
            mean_index=0.0,
            weighted_index=0.0,
            band_counts={"healthy": 0, "good": 0, "warning": 0, "critical": 0},
            below_floor=0,
            operationally_impaired=0,
        )

    count = len(results)
    bands = {"healthy": 0, "good": 0, "warning": 0, "critical": 0}
    for entry in results:
        bands[entry.band] = bands.get(entry.band, 0) + 1

    # Criticality is the weight, floored so a D-class asset still counts for
    # something rather than dropping out of the estate figure entirely.
    weights = [max(10.0, criticality_scores.get(entry.asset_id, 50.0)) for entry in results]
    total_weight = sum(weights)
    weighted = (
        sum(entry.index * weight for entry, weight in zip(results, weights)) / total_weight
        if total_weight > 0
        else 0.0
    )

    return FleetHealthIndex(
        assets=count,
        mean_index=round(sum(entry.index for entry in results) / count, 1),
        weighted_index=round(weighted, 1),
        band_counts=bands,
        below_floor=sum(1 for entry in results if entry.index < floor),
        operationally_impaired=sum(1 for entry in results if entry.condition_gap <= _IMPAIRMENT_GAP),
    )
