"""Risk, priority, and the decisions that follow from them.

Risk here is the standard product and nothing more inventive: **probability times
consequence**. Consequence is the criticality score, which carries no probability.
Probability is assembled from what the upstream satellites measured. Keeping the
two apart all the way to the multiplication is what makes a risk figure
explainable — an operator can be told *why* an asset is high risk, and the answer
is either "it is likely to fail" or "it would matter enormously if it did", and
those two answers lead to different work.

Priority is not risk. Risk is a property of the asset; priority is a property of
the *queue*, and it has to account for how long something has already been
waiting, or the same three assets sit at the top of the list forever while a
medium-risk job ages out. Priority therefore reads risk as an input and adds
urgency and backlog age on top.

Repair-versus-replace is the one calculation here that is a business decision
rather than a score. It is answered against the value the repair actually buys —
bounded by the worst part the repair does *not* touch, because replacing a battery
in a laptop whose cooling system is also spent buys very little life and the
arithmetic should say so.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.mock_data.signals import clamp, clamp01
from app.services.apm.config import RUL_ADEQUACY_DAYS, ApmConfig, get_apm_config
from app.services.apm.cost import RepairEstimate

# ── Risk ─────────────────────────────────────────────────────────────────

#: Weighting of the four probability signals. PdM's failure probability dominates
#: because it is the only one that is actually a forecast; the others are evidence
#: that the forecast should be believed.
_PROBABILITY_WEIGHTS: dict[str, float] = {
    "prediction": 0.55,
    "alarm": 0.20,
    "failure_rate": 0.15,
    "condition": 0.10,
}

#: Failure rate per thousand hours at which that signal saturates. Two failures
#: per thousand operating hours is already a poorly behaved asset.
_FAILURE_RATE_CEILING = 2.0

#: Risk bands. Named with the platform's own risk tiers so the interface colours
#: an APM risk score against the same scale it already colours risk by, rather
#: than APM inventing a fifth vocabulary for the same idea.
#:
#: Calibrated against the range the *product* of two bounded factors actually
#: reaches, not against its arithmetic ceiling. A probability index above 0.8 on an
#: asset scoring above 90 for consequence is a combination this estate cannot
#: produce, so bands spaced evenly to 100 would leave the top two tiers
#: permanently empty and quietly turn a five-band scale into a three-band one.
#: A fully degraded A-class asset lands near 65; these thresholds put it in
#: Critical and leave headroom above it.
RISK_BANDS: tuple[tuple[float, str, str], ...] = (
    (40.0, "critical", "Critical"),
    (25.0, "high", "High"),
    (12.0, "medium", "Medium"),
    (4.0, "low", "Low"),
    (0.0, "healthy", "Negligible"),
)


def risk_band(score: float) -> tuple[str, str]:
    for minimum, tier, label in RISK_BANDS:
        if score >= minimum:
            return tier, label
    return RISK_BANDS[-1][1], RISK_BANDS[-1][2]


@dataclass(frozen=True)
class RiskResult:
    asset_id: str
    #: 0–100. Probability index times criticality.
    score: float
    tier: str
    label: str
    #: 0–1 composite probability of failure.
    probability_index: float
    #: 0–100 consequence, straight from the criticality model.
    consequence: float
    #: The signals behind the probability, so the score can be taken apart.
    signals: dict[str, float]
    #: The weight each signal was actually given. Not always the configured
    #: weight: a signal that was dropped for lack of evidence shows zero, and its
    #: weight appears redistributed across the ones that survived.
    applied_weights: dict[str, float]
    #: Which side of the product is driving the score. 'probability' means the
    #: asset is likely to fail; 'consequence' means it would matter if it did.
    driver: str

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "risk_score": self.score,
            "risk_tier": self.tier,
            "risk_label": self.label,
            "probability_index": self.probability_index,
            "consequence": self.consequence,
            "signals": dict(self.signals),
            "applied_weights": dict(self.applied_weights),
            "driver": self.driver,
        }


def compute_risk(
    asset_id: str,
    *,
    failure_probability: float,
    alarm_pressure: float,
    failure_rate_per_1000h: float,
    health_index: float,
    criticality_score: float,
    failure_rate_credible: bool = True,
) -> RiskResult:
    """Risk score for one asset.

    An asset watched for forty minutes has no meaningful failure *rate*, and
    feeding one in corrupts the score in both directions: three events in that
    window extrapolate to thousands per thousand hours and pin the signal at one,
    while an asset that happened to have none reads zero and drags a genuinely
    elevated prediction down. Where the rate is not credible its weight is
    redistributed across the signals that are, rather than the signal being
    silently zeroed — dropping evidence is honest, inventing it is not.
    """
    signals = {
        "prediction": clamp01(failure_probability),
        "alarm": clamp01(alarm_pressure),
        "failure_rate": clamp01(failure_rate_per_1000h / _FAILURE_RATE_CEILING),
        "condition": clamp01(1.0 - health_index / 100.0),
    }

    weights = dict(_PROBABILITY_WEIGHTS)
    if not failure_rate_credible:
        dropped = weights.pop("failure_rate")
        remaining = sum(weights.values())
        weights = {key: value * (1.0 + dropped / remaining) for key, value in weights.items()}
        weights["failure_rate"] = 0.0

    probability = clamp01(sum(weights[key] * value for key, value in signals.items()))
    consequence = clamp(criticality_score, 0.0, 100.0)

    score = round(probability * consequence, 1)
    tier, label = risk_band(score)

    # Which half of the product to explain the score by. Comparing the two
    # directly would be meaningless: probability sits in the bottom half of its
    # range across any functioning estate while consequence averages near the
    # middle of its own, so the naive comparison answers "consequence" for
    # essentially every asset and tells an operator nothing. Each side is judged
    # against its own scale instead, and an asset that is neither notably likely to
    # fail nor notably consequential is reported as balanced rather than forced
    # into one of the two.
    if probability >= 0.5:
        driver = "probability"
    elif consequence >= 55.0:
        driver = "consequence"
    else:
        driver = "balanced"

    return RiskResult(
        asset_id=asset_id,
        score=score,
        tier=tier,
        label=label,
        probability_index=round(probability, 4),
        consequence=round(consequence, 1),
        signals={key: round(value, 4) for key, value in signals.items()},
        applied_weights={key: round(value, 4) for key, value in weights.items()},
        driver=driver,
    )


# ── Priority ─────────────────────────────────────────────────────────────

#: Weighting of the priority terms.
_PRIORITY_WEIGHTS: dict[str, float] = {
    "risk": 0.34,
    "condition": 0.22,
    "urgency": 0.18,
    "criticality": 0.16,
    "age": 0.10,
}

#: Days outstanding at which backlog age contributes its full weight. A job that
#: has waited a month should not still be losing to a fresh job of equal risk.
_BACKLOG_AGE_CEILING_DAYS = 30.0

#: Priority classes, highest first. `code` is what a work order carries; `label`
#: reuses the platform's existing priority vocabulary so a consumer does not have
#: to translate between two sets of names for the same four levels.
#:
#: Calibrated the same way the risk bands are: the weighted sum only reaches the
#: high seventies when every term is near its worst simultaneously — critical risk,
#: spent condition, no remaining life, top criticality and a month in the queue.
#: Thresholds spaced to 100 would make P1 unreachable and quietly demote the whole
#: queue by one class.
PRIORITY_CLASSES: tuple[tuple[float, str, str], ...] = (
    (55.0, "P1", "Critical"),
    (38.0, "P2", "High"),
    (22.0, "P3", "Medium"),
    (0.0, "P4", "Low"),
)


def priority_class(score: float) -> tuple[str, str]:
    for minimum, code, label in PRIORITY_CLASSES:
        if score >= minimum:
            return code, label
    return PRIORITY_CLASSES[-1][1], PRIORITY_CLASSES[-1][2]


@dataclass(frozen=True)
class PriorityResult:
    asset_id: str
    #: 0–100.
    score: float
    code: str
    label: str
    terms: dict[str, float]
    #: Target response time in hours implied by the class.
    response_target_hours: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "priority_score": self.score,
            "priority_code": self.code,
            "priority": self.label,
            "terms": dict(self.terms),
            "response_target_hours": self.response_target_hours,
        }


#: Hours from raise to attendance allowed for each priority class.
RESPONSE_TARGET_HOURS: dict[str, float] = {"P1": 4.0, "P2": 24.0, "P3": 120.0, "P4": 336.0}


def compute_priority(
    asset_id: str,
    *,
    risk_score: float,
    health_index: float,
    rul_days: float,
    criticality_score: float,
    days_outstanding: float = 0.0,
) -> PriorityResult:
    """Priority score for the work queued against one asset."""
    terms = {
        "risk": clamp01(risk_score / 100.0),
        "condition": clamp01(1.0 - health_index / 100.0),
        "urgency": clamp01(1.0 - rul_days / RUL_ADEQUACY_DAYS),
        "criticality": clamp01(criticality_score / 100.0),
        "age": clamp01(days_outstanding / _BACKLOG_AGE_CEILING_DAYS),
    }

    score = round(
        clamp(sum(_PRIORITY_WEIGHTS[key] * value for key, value in terms.items()) * 100.0, 0.0, 100.0),
        1,
    )
    code, label = priority_class(score)

    return PriorityResult(
        asset_id=asset_id,
        score=score,
        code=code,
        label=label,
        terms={key: round(value, 4) for key, value in terms.items()},
        response_target_hours=RESPONSE_TARGET_HOURS[code],
    )


# ── Repair or replace ────────────────────────────────────────────────────


@dataclass(frozen=True)
class LifecycleDecision:
    asset_id: str
    #: 'repair', 'replace', 'monitor' or 'run-to-failure'.
    decision: str
    label: str
    rationale: str
    #: Cost of the repair, planned.
    repair_cost: float
    replacement_cost: float
    #: Repair cost as a share of replacement cost.
    repair_ratio: float
    #: Share of the asset's life the repair actually buys back, bounded by the
    #: worst part the repair does not touch.
    recovered_life_share: float
    #: Money value of the life the repair buys.
    repair_value: float
    effective_age_days: float
    ageing_factor: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "decision": self.decision,
            "decision_label": self.label,
            "rationale": self.rationale,
            "repair_cost": self.repair_cost,
            "replacement_cost": self.replacement_cost,
            "repair_ratio": self.repair_ratio,
            "recovered_life_share": self.recovered_life_share,
            "repair_value": self.repair_value,
            "effective_age_days": self.effective_age_days,
            "ageing_factor": self.ageing_factor,
        }


def repair_or_replace(
    asset_id: str,
    *,
    estimate: RepairEstimate,
    component_wear: list[tuple[str, float]],
    replacement_cost: float,
    criticality_score: float,
    failure_probability: float,
    effective_age: float,
    ageing_factor: float,
    config: ApmConfig | None = None,
) -> LifecycleDecision:
    """Whether to repair the asset, replace it, or leave it alone.

    Answered against the value the repair buys rather than against a flat cost
    ratio. The life it buys back is bounded by the worst component the repair does
    *not* address — an asset is only as young as its oldest remaining part, and a
    rule that ignores this recommends repairs that solve nothing.
    """
    settings = config or get_apm_config()
    threshold = settings.cost.repair_replace_threshold

    in_scope = {entry.component for entry in estimate.components}
    untouched = [wear for name, wear in component_wear if name not in in_scope]
    limiting_wear = max(untouched) if untouched else 0.0

    recovered = clamp01(1.0 - limiting_wear)
    repair_value = replacement_cost * recovered
    repair_ratio = estimate.planned_total / replacement_cost if replacement_cost > 0 else 0.0

    worst_wear = max((wear for _name, wear in component_wear), default=0.0)

    # Nothing is worn enough to act on and failure is not projected: the right
    # answer is to keep watching, and spending money now buys nothing.
    if not in_scope or (worst_wear < 0.35 and failure_probability < 0.15):
        return LifecycleDecision(
            asset_id=asset_id,
            decision="monitor",
            label="Monitor",
            rationale=(
                f"Worst component at {worst_wear * 100:.0f}% wear with a "
                f"{failure_probability * 100:.0f}% failure probability in horizon. "
                "No intervention is justified by condition yet."
            ),
            repair_cost=estimate.planned_total,
            replacement_cost=round(replacement_cost, 2),
            repair_ratio=round(repair_ratio, 3),
            recovered_life_share=round(recovered, 3),
            repair_value=round(repair_value, 2),
            effective_age_days=effective_age,
            ageing_factor=ageing_factor,
        )

    # A low-consequence asset whose repair costs more than a meaningful share of
    # replacement is not worth either: run it until it stops.
    if criticality_score < 30.0 and repair_ratio > 0.45:
        return LifecycleDecision(
            asset_id=asset_id,
            decision="run-to-failure",
            label="Run to failure",
            rationale=(
                f"Repair is {repair_ratio * 100:.0f}% of replacement on a low-consequence asset "
                f"(criticality {criticality_score:.0f}). Neither repair nor early replacement "
                "returns the spend; hold a spare and replace it when it stops."
            ),
            repair_cost=estimate.planned_total,
            replacement_cost=round(replacement_cost, 2),
            repair_ratio=round(repair_ratio, 3),
            recovered_life_share=round(recovered, 3),
            repair_value=round(repair_value, 2),
            effective_age_days=effective_age,
            ageing_factor=ageing_factor,
        )

    if repair_ratio >= threshold or estimate.planned_total > repair_value:
        if repair_ratio >= threshold:
            reason = (
                f"Repair is {repair_ratio * 100:.0f}% of the {replacement_cost:,.0f} replacement cost, "
                f"past the {threshold * 100:.0f}% threshold."
            )
        else:
            reason = (
                f"Repair costs {estimate.planned_total:,.0f} but buys back only "
                f"{recovered * 100:.0f}% of life — worth {repair_value:,.0f} — because "
                "the remaining components are already worn."
            )
        return LifecycleDecision(
            asset_id=asset_id,
            decision="replace",
            label="Replace",
            rationale=reason,
            repair_cost=estimate.planned_total,
            replacement_cost=round(replacement_cost, 2),
            repair_ratio=round(repair_ratio, 3),
            recovered_life_share=round(recovered, 3),
            repair_value=round(repair_value, 2),
            effective_age_days=effective_age,
            ageing_factor=ageing_factor,
        )

    return LifecycleDecision(
        asset_id=asset_id,
        decision="repair",
        label="Repair",
        rationale=(
            f"Repairing {estimate.primary_component.lower()} costs {estimate.planned_total:,.0f} "
            f"and restores {recovered * 100:.0f}% of service life, worth {repair_value:,.0f} "
            f"against a {replacement_cost:,.0f} replacement."
        ),
        repair_cost=estimate.planned_total,
        replacement_cost=round(replacement_cost, 2),
        repair_ratio=round(repair_ratio, 3),
        recovered_life_share=round(recovered, 3),
        repair_value=round(repair_value, 2),
        effective_age_days=effective_age,
        ageing_factor=ageing_factor,
    )


# ── Recommended action ───────────────────────────────────────────────────


@dataclass(frozen=True)
class RecommendedAction:
    asset_id: str
    #: Imperative sentence an operator can act on.
    action: str
    #: Why, in business terms.
    rationale: str
    #: When it has to happen.
    window: str
    priority: str
    #: Whether APM believes a work order should exist for this.
    raise_work_order: bool
    #: Suggested work order type when one should be raised.
    work_order_type: str | None
    #: Expected money saved by acting in the window rather than after a failure.
    expected_saving: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "action": self.action,
            "rationale": self.rationale,
            "window": self.window,
            "priority": self.priority,
            "raise_work_order": self.raise_work_order,
            "work_order_type": self.work_order_type,
            "expected_saving": self.expected_saving,
        }


def _window_for(rul_days: float, priority_code: str) -> str:
    if priority_code == "P1":
        return "Immediately"
    if rul_days <= 7.0:
        return "Within the week"
    if rul_days <= 30.0:
        return "Within the month"
    if priority_code == "P2":
        return "Next service window"
    return "Next planned cycle"


def recommend(
    asset_id: str,
    *,
    decision: LifecycleDecision,
    priority: PriorityResult,
    risk: RiskResult,
    rul_days: float,
    exposure: float,
    is_offline: bool,
    open_failures: int,
) -> RecommendedAction:
    """The single action APM recommends for one asset.

    Ordered by what blocks everything else. A device nobody can reach cannot be
    assessed, so restoring the link outranks any condition-based work — there is
    no point dispatching a technician to replace a part on evidence that stopped
    updating.
    """
    saving = round(max(0.0, exposure - decision.repair_cost), 2)

    if is_offline:
        return RecommendedAction(
            asset_id=asset_id,
            action="Restore connectivity before committing condition work",
            rationale=(
                "The asset is not reporting, so its condition cannot be assessed and every "
                "figure APM holds for it is stale. Any work dispatched now is dispatched on "
                "evidence that has stopped updating."
            ),
            window="Immediately",
            priority=priority.label,
            raise_work_order=True,
            work_order_type="Inspection",
            expected_saving=saving,
        )

    if open_failures > 0:
        return RecommendedAction(
            asset_id=asset_id,
            action=f"Close out {open_failures} open failure{'' if open_failures == 1 else 's'}",
            rationale=(
                f"Risk is {risk.label.lower()} at {risk.score:.0f} with unresolved failures "
                "outstanding. Nothing else on this asset should be planned around a fault "
                "that has not been cleared."
            ),
            window="Immediately" if priority.code in ("P1", "P2") else "Within the week",
            priority=priority.label,
            raise_work_order=True,
            work_order_type="Corrective",
            expected_saving=saving,
        )

    window = _window_for(rul_days, priority.code)

    # Repair-versus-replace answers *what* to do when the asset needs work. It does
    # not answer *when*, and it must not be allowed to imply now. An asset can carry
    # a settled "replace it" verdict — a worn part in a device too cheap to repair —
    # while being months from needing anything at all. Raising a work order against
    # that consumes approval and planning capacity to no purpose, so the verdict is
    # recorded and the order waits until priority or remaining life calls for it.
    committed = priority.code in ("P1", "P2", "P3") or rul_days <= 90.0

    if decision.decision == "replace":
        return RecommendedAction(
            asset_id=asset_id,
            action=(
                "Raise a replacement request"
                if committed
                else "Plan replacement at end of life — no action due yet"
            ),
            rationale=decision.rationale,
            window=window if committed else "Next planned cycle",
            priority=priority.label,
            raise_work_order=committed,
            work_order_type="Replacement" if committed else None,
            expected_saving=saving,
        )

    if decision.decision == "repair":
        return RecommendedAction(
            asset_id=asset_id,
            action=(
                f"Schedule {decision.asset_id} for {decision.repair_cost:,.0f} of planned repair"
                if committed
                else f"Hold {decision.asset_id} for repair at next service window"
            ),
            rationale=decision.rationale,
            window=window if committed else "Next planned cycle",
            priority=priority.label,
            raise_work_order=committed,
            work_order_type="Preventive" if committed else None,
            expected_saving=saving,
        )

    if decision.decision == "run-to-failure":
        return RecommendedAction(
            asset_id=asset_id,
            action="Hold a spare and run to failure",
            rationale=decision.rationale,
            window="No action",
            priority="Low",
            raise_work_order=False,
            work_order_type=None,
            expected_saving=0.0,
        )

    return RecommendedAction(
        asset_id=asset_id,
        action="Continue condition monitoring",
        rationale=decision.rationale,
        window="No action",
        priority=priority.label,
        raise_work_order=False,
        work_order_type=None,
        expected_saving=0.0,
    )
