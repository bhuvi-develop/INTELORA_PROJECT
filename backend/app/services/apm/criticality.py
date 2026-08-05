"""The criticality model.

Criticality answers one question: if this asset fails, how much does it matter?
It is a *consequence* score and deliberately carries no probability — multiplying
the two is what produces risk, and keeping them apart is what lets an operator
see that a low-risk asset is low-risk because it is unlikely to fail rather than
because nobody would care if it did.

Six factors, each scored 1–5 from the register and the live estate, combined
under the configurable weights in `config`. Every factor is derived from data the
platform already holds; none of them is a stored opinion, which means the whole
model recomputes when the estate changes rather than going stale in a
spreadsheet.

    safety             stored energy and thermal ceiling of the device
    production_impact  assigned criticality against how hard the unit is worked
    replacement_cost    what the asset costs to put back, log-scaled
    lead_time          how long the estate waits for a replacement
    redundancy         whether a healthy peer of the same class could cover it
    business_impact    assigned criticality against its position in its class
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.mock_data.signals import clamp, clamp01
from app.services.apm.config import (
    CRITICALITY_FACTORS,
    ApmConfig,
    criticality_class,
    get_apm_config,
)
from app.services.simulator import AssetState

#: Bounds of the log scale the replacement-cost factor is mapped onto. A cheap
#: consumable sits at the floor and a whole workstation near the ceiling, and the
#: scale is logarithmic because the difference between $15 and $150 matters more
#: to a decision than the difference between $1,500 and $1,635.
_COST_FLOOR = 10.0
_COST_CEILING = 2500.0

#: Lead time at or beyond which the factor saturates. Three weeks without the
#: asset is already the worst case any procurement here produces.
_LEAD_TIME_CEILING_DAYS = 21.0

#: Healthy peers of the same class at which redundancy is fully satisfied.
_REDUNDANCY_POOL = 6.0

#: Base consequence from the assigned criticality label on the register.
_LABEL_BASE: dict[str, float] = {"High": 4.6, "Medium": 3.0, "Low": 1.6}


@dataclass(frozen=True)
class FleetContext:
    """What the rest of the estate looks like, for the factors that need it.

    Redundancy and the cost percentile cannot be judged from one asset in
    isolation, so they are computed once per pass and handed in rather than
    recomputed per asset.
    """

    #: Count of assets in each category whose condition is healthy or good, so a
    #: degrading fleet becomes less redundant rather than nominally staying so.
    healthy_peers: dict[str, int]
    #: Replacement cost of every asset in each category, used for the percentile.
    category_costs: dict[str, list[float]]

    @staticmethod
    def build(states: list[AssetState], config: ApmConfig | None = None) -> FleetContext:
        settings = config or get_apm_config()
        peers: dict[str, int] = {}
        costs: dict[str, list[float]] = {}

        for state in states:
            category = state.seed.category
            costs.setdefault(category, []).append(
                settings.cost.replacement_cost(category, state.seed.brand)
            )
            # An offline asset cannot cover for anything, and a degraded one
            # should not be counted as cover it cannot reliably provide.
            if state.device_status != "Offline" and state.health >= 80.0:
                peers[category] = peers.get(category, 0) + 1

        return FleetContext(healthy_peers=peers, category_costs=costs)

    def peers_for(self, category: str, exclude_self: bool) -> float:
        count = float(self.healthy_peers.get(category, 0))
        return max(0.0, count - 1.0) if exclude_self else count

    def cost_percentile(self, category: str, cost: float) -> float:
        """Where this asset's replacement cost sits within its own class, 0–1."""
        values = self.category_costs.get(category)
        if not values:
            return 0.5
        below = sum(1 for value in values if value < cost)
        return below / len(values)


@dataclass(frozen=True)
class CriticalityFactor:
    key: str
    label: str
    #: 1–5, where 5 is the worst consequence.
    score: float
    #: Contribution to the 0–100 composite after weighting.
    contribution: float
    weight: float
    basis: str


@dataclass(frozen=True)
class CriticalityResult:
    asset_id: str
    #: 0–100 composite consequence score.
    score: float
    #: A–D class letter.
    code: str
    #: Critical / High / Medium / Low.
    label: str
    #: The register's own High/Medium/Low, kept alongside so a consumer can see
    #: where the model disagrees with what was assigned by hand.
    assigned: str
    factors: list[CriticalityFactor]
    replacement_cost: float
    lead_time_days: float
    #: Cost of an hour out of service at this criticality class.
    downtime_rate_per_hour: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "criticality_score": self.score,
            "criticality_code": self.code,
            "criticality_label": self.label,
            "assigned_criticality": self.assigned,
            "replacement_cost": self.replacement_cost,
            "lead_time_days": self.lead_time_days,
            "downtime_rate_per_hour": self.downtime_rate_per_hour,
            "factors": [
                {
                    "key": factor.key,
                    "label": factor.label,
                    "score": factor.score,
                    "weight": factor.weight,
                    "contribution": factor.contribution,
                    "basis": factor.basis,
                }
                for factor in self.factors
            ],
        }


_FACTOR_LABELS: dict[str, str] = {
    "safety": "Safety",
    "production_impact": "Production impact",
    "replacement_cost": "Replacement cost",
    "lead_time": "Lead time",
    "redundancy": "Redundancy",
    "business_impact": "Business impact",
}


def _safety(state: AssetState) -> tuple[float, str]:
    """Stored energy and thermal ceiling.

    Both are hazards in an electrical asset: the power it can deliver into a
    fault and the temperature it reaches before its own protection acts. A 96 W
    adapter running to 78 °C is a materially different proposition from a 30 W
    charger that cuts out at 65 °C, and the register already knows the
    difference.
    """
    power = clamp01(state.profile.rated_power_w / 100.0)
    thermal = clamp01(state.profile.max_temperature_c / 90.0)
    score = 1.0 + 4.0 * clamp01(0.5 * power + 0.5 * thermal)
    return score, (
        f"{state.profile.rated_power_w:.0f} W rated into a {state.profile.max_temperature_c:.0f} °C ceiling"
    )


def _production_impact(state: AssetState) -> tuple[float, str]:
    """What stops when the asset does, adjusted for how hard it is worked.

    Duty factor is the honest correction: two identical laptops with the same
    assigned criticality are not equally impactful if one runs at 1.42 duty and
    the other at 0.74.
    """
    base = _LABEL_BASE.get(state.seed.criticality, 3.0)
    duty = (state.seed.duty_factor - 1.0) * 1.6
    score = clamp(base + duty, 1.0, 5.0)
    return score, f"{state.seed.criticality} criticality at {state.seed.duty_factor:.2f} duty"


def _replacement_cost(cost: float) -> tuple[float, str]:
    span = math.log(_COST_CEILING / _COST_FLOOR)
    position = clamp01(math.log(max(cost, _COST_FLOOR) / _COST_FLOOR) / span)
    return 1.0 + 4.0 * position, f"{cost:,.0f} to replace"


def _lead_time(days: float) -> tuple[float, str]:
    return 1.0 + 4.0 * clamp01(days / _LEAD_TIME_CEILING_DAYS), f"{days:.0f} day procurement"


def _redundancy(peers: float, assigned: str) -> tuple[float, str]:
    """Whether a healthy peer could cover the loss.

    Scored downward from the assigned criticality rather than from a flat base:
    a high-criticality unit is less substitutable even where nominal cover
    exists, because the cover is not configured, provisioned or assigned to the
    same work.
    """
    base = clamp(_LABEL_BASE.get(assigned, 3.0) + 0.4, 1.0, 5.0)
    relief = 2.4 * clamp01(peers / _REDUNDANCY_POOL)
    score = clamp(base - relief, 1.0, 5.0)
    return score, f"{peers:.0f} healthy peer{'' if peers == 1 else 's'} available as cover"


def _business_impact(assigned: str, cost_percentile: float) -> tuple[float, str]:
    """Assigned criticality, moved by the asset's standing within its own class.

    The top of a class tends to be where the work that matters is done, so the
    percentile is a proxy for it that does not require an owner field the product
    does not have.
    """
    base = _LABEL_BASE.get(assigned, 3.0)
    score = clamp(base + (cost_percentile - 0.5) * 1.2, 1.0, 5.0)
    return score, f"{assigned} impact, {cost_percentile * 100:.0f}th percentile in its class"


def score_asset(
    state: AssetState,
    context: FleetContext,
    config: ApmConfig | None = None,
) -> CriticalityResult:
    """The six-factor consequence score for one asset."""
    settings = config or get_apm_config()
    weights = settings.criticality
    category = state.seed.category

    cost = settings.cost.replacement_cost(category, state.seed.brand)
    lead_time = settings.cost.lead_time(category)
    peers = context.peers_for(category, exclude_self=state.device_status != "Offline")
    percentile = context.cost_percentile(category, cost)

    raw: dict[str, tuple[float, str]] = {
        "safety": _safety(state),
        "production_impact": _production_impact(state),
        "replacement_cost": _replacement_cost(cost),
        "lead_time": _lead_time(lead_time),
        "redundancy": _redundancy(peers, state.seed.criticality),
        "business_impact": _business_impact(state.seed.criticality, percentile),
    }

    weight_map = weights.as_dict()
    factors: list[CriticalityFactor] = []
    composite = 0.0

    for key in CRITICALITY_FACTORS:
        score, basis = raw[key]
        weight = weight_map[key]
        # Each factor is normalised out of its own 1–5 range before weighting, so
        # the composite lands on 0–100 whatever the weights are set to.
        contribution = weight * ((score - 1.0) / 4.0) * 100.0
        composite += contribution
        factors.append(
            CriticalityFactor(
                key=key,
                label=_FACTOR_LABELS[key],
                score=round(score, 2),
                contribution=round(contribution, 2),
                weight=round(weight, 4),
                basis=basis,
            )
        )

    composite = round(clamp(composite, 0.0, 100.0), 1)
    code, label = criticality_class(composite)

    return CriticalityResult(
        asset_id=state.asset_id,
        score=composite,
        code=code,
        label=label,
        assigned=state.seed.criticality,
        factors=factors,
        replacement_cost=cost,
        lead_time_days=lead_time,
        downtime_rate_per_hour=settings.cost.downtime_rate(code),
    )
