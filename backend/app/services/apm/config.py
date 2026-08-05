"""APM configuration.

Every tunable the APM module owns: the criticality weighting model, the health
index weighting, the cost model behind maintenance spend and cost exposure, and
the targets that maintenance effectiveness is scored against.

It is mutable at runtime because the specification asks for a *configurable*
criticality model — a reliability engineer raises the weight on safety without a
deploy. Weights are renormalised on every update, so a caller cannot leave the
model summing to something other than one and silently rescale every score in
the estate.

Nothing outside this package reads this file, and nothing in it shadows a
platform setting from `app.config`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace

from app.mock_data.catalog import LAPTOP, MOBILE_CHARGER

# ── Criticality model ────────────────────────────────────────────────────

#: The six consequence factors, in the order they are published.
CRITICALITY_FACTORS: tuple[str, ...] = (
    "safety",
    "production_impact",
    "replacement_cost",
    "lead_time",
    "redundancy",
    "business_impact",
)


@dataclass(frozen=True)
class CriticalityWeights:
    """Relative importance of each consequence factor.

    The defaults follow the ordering reliability engineering usually settles on:
    nobody is injured by a slow procurement, so safety outranks lead time, and
    what the asset stops when it fails outranks what it costs to replace.
    """

    safety: float = 0.26
    production_impact: float = 0.22
    replacement_cost: float = 0.14
    lead_time: float = 0.12
    redundancy: float = 0.12
    business_impact: float = 0.14

    def as_dict(self) -> dict[str, float]:
        return {factor: float(getattr(self, factor)) for factor in CRITICALITY_FACTORS}

    def normalised(self) -> CriticalityWeights:
        """Weights scaled to sum to one.

        A caller who sets three weights and forgets the others would otherwise
        change the *scale* of every criticality score in the estate rather than
        the balance between its factors, and a score whose ceiling moved would
        break every threshold downstream of it.
        """
        values = self.as_dict()
        total = sum(values.values())
        if total <= 0.0:
            return CriticalityWeights()
        return CriticalityWeights(**{key: value / total for key, value in values.items()})


#: Criticality classes, highest first. `minimum` is the inclusive lower bound on
#: the 0–100 score. The letter is what a CMMS operator recognises; the label is
#: what the interface renders.
CRITICALITY_CLASSES: tuple[tuple[float, str, str], ...] = (
    (75.0, "A", "Critical"),
    (55.0, "B", "High"),
    (35.0, "C", "Medium"),
    (0.0, "D", "Low"),
)


def criticality_class(score: float) -> tuple[str, str]:
    """Letter and label for a criticality score."""
    for minimum, code, label in CRITICALITY_CLASSES:
        if score >= minimum:
            return code, label
    return CRITICALITY_CLASSES[-1][1], CRITICALITY_CLASSES[-1][2]


# ── Asset health index ───────────────────────────────────────────────────


@dataclass(frozen=True)
class HealthIndexWeights:
    """Weighting of the five terms in the Asset Health Index.

    Condition dominates, and dominates deliberately. The reliability and alarm
    terms sit at or near full satisfaction across a well-behaved estate, so
    weighting them heavily would float a worn asset upward on the strength of
    terms that are not discriminating between assets at all. Condition, remaining
    life and failure probability are the terms that actually separate one asset
    from another, and between them they carry seven tenths of the index.
    """

    #: PdM health score.
    condition: float = 0.40
    #: Measured operational availability, scored against the availability target.
    reliability: float = 0.14
    #: Inverse of the AD alarm pressure.
    alarm: float = 0.14
    #: Remaining useful life against the adequacy horizon.
    life: float = 0.18
    #: Inverse of the PdM failure probability.
    integrity: float = 0.14

    def as_dict(self) -> dict[str, float]:
        return {
            "condition": self.condition,
            "reliability": self.reliability,
            "alarm": self.alarm,
            "life": self.life,
            "integrity": self.integrity,
        }

    def normalised(self) -> HealthIndexWeights:
        values = self.as_dict()
        total = sum(values.values())
        if total <= 0.0:
            return HealthIndexWeights()
        return HealthIndexWeights(**{key: value / total for key, value in values.items()})


#: Remaining life at or above which the life term is fully satisfied. Six months
#: of headroom is enough to plan, budget and procure, so more than that does not
#: make an asset healthier.
RUL_ADEQUACY_DAYS = 180.0

#: Ceiling on the health index of an asset that is not reporting. Its condition
#: cannot be observed, and unknown is not the same as good — the same rule the
#: platform's risk tiering already applies.
UNOBSERVABLE_AHI_CEILING = 68.0


# ── Cost model ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CostModel:
    """The money behind every APM cost figure.

    Currency is whatever the tariff is quoted in; the module never converts.
    """

    currency: str = "USD"

    #: Fully-loaded technician rate per hour.
    labour_rate_per_hour: float = 65.0
    #: Multiplier on the labour rate for unplanned work — call-out, overtime and
    #: the diagnosis a planned job does not need.
    reactive_labour_multiplier: float = 1.75
    #: Fixed administrative cost of raising and closing any work order.
    work_order_overhead: float = 18.0

    #: Cost of an hour of lost service, by criticality class. This is the figure
    #: that makes prevention arithmetic rather than opinion.
    downtime_rate_per_hour: dict[str, float] = None  # type: ignore[assignment]

    #: Replacement cost of a whole asset, by category, before the brand premium.
    replacement_base: dict[str, float] = None  # type: ignore[assignment]
    #: Brand premium on the replacement cost.
    brand_multiplier: dict[str, float] = None  # type: ignore[assignment]
    #: Part cost per serviceable component, keyed by category then component.
    component_cost: dict[str, dict[str, float]] = None  # type: ignore[assignment]
    #: Labour hours to service or replace each component.
    component_hours: dict[str, dict[str, float]] = None  # type: ignore[assignment]
    #: Procurement lead time in days, by category.
    lead_time_days: dict[str, float] = None  # type: ignore[assignment]

    #: Share of the replacement cost that a failure in service damages beyond the
    #: failed part itself — a battery that vents takes the chassis with it.
    secondary_damage_share: float = 0.18
    #: Repair spend, as a share of replacement cost, past which replacement is
    #: the cheaper answer over the remaining life.
    repair_replace_threshold: float = 0.55

    def __post_init__(self) -> None:
        # Mutable defaults on a frozen dataclass have to be installed here.
        object.__setattr__(
            self,
            "downtime_rate_per_hour",
            self.downtime_rate_per_hour or {"A": 240.0, "B": 145.0, "C": 70.0, "D": 22.0},
        )
        object.__setattr__(
            self,
            "replacement_base",
            self.replacement_base or {LAPTOP: 1250.0, MOBILE_CHARGER: 45.0},
        )
        object.__setattr__(
            self,
            "brand_multiplier",
            self.brand_multiplier
            or {
                "Apple": 1.58,
                "Dell": 1.00,
                "HP": 0.96,
                "Lenovo": 1.04,
                "Asus": 0.88,
                "Acer": 0.79,
                "Anker": 1.00,
                "Belkin": 1.12,
                "Samsung": 1.06,
                "Ugreen": 0.82,
                "Baseus": 0.71,
            },
        )
        object.__setattr__(
            self,
            "component_cost",
            self.component_cost
            or {
                LAPTOP: {
                    "Battery": 95.0,
                    "CPU": 420.0,
                    "Cooling System": 58.0,
                    "Power Adapter Port": 110.0,
                    "RAM": 55.0,
                    "SSD": 92.0,
                },
                MOBILE_CHARGER: {
                    "Power Module": 22.0,
                    "Transformer": 18.0,
                    "USB-C Output": 12.0,
                    "Protection Circuit": 15.0,
                    "Cable": 14.0,
                    "Thermal Sensor": 9.0,
                },
            },
        )
        object.__setattr__(
            self,
            "component_hours",
            self.component_hours
            or {
                LAPTOP: {
                    "Battery": 0.8,
                    "CPU": 3.5,
                    "Cooling System": 1.6,
                    "Power Adapter Port": 2.2,
                    "RAM": 0.5,
                    "SSD": 0.9,
                },
                MOBILE_CHARGER: {
                    "Power Module": 0.6,
                    "Transformer": 0.7,
                    "USB-C Output": 0.5,
                    "Protection Circuit": 0.6,
                    "Cable": 0.3,
                    "Thermal Sensor": 0.4,
                },
            },
        )
        object.__setattr__(
            self,
            "lead_time_days",
            self.lead_time_days or {LAPTOP: 14.0, MOBILE_CHARGER: 4.0},
        )

    # ── Lookups ─────────────────────────────────────────────────────────

    def replacement_cost(self, category: str, brand: str) -> float:
        base = self.replacement_base.get(category, 250.0)
        return round(base * self.brand_multiplier.get(brand, 1.0), 2)

    def part_cost(self, category: str, component: str) -> float:
        return self.component_cost.get(category, {}).get(component, 25.0)

    def labour_hours(self, category: str, component: str) -> float:
        return self.component_hours.get(category, {}).get(component, 1.0)

    def lead_time(self, category: str) -> float:
        return self.lead_time_days.get(category, 10.0)

    def downtime_rate(self, criticality_code: str) -> float:
        return self.downtime_rate_per_hour.get(criticality_code, 70.0)

    def as_dict(self) -> dict:
        return asdict(self)


# ── Maintenance targets ──────────────────────────────────────────────────


@dataclass(frozen=True)
class MaintenanceTargets:
    """What good looks like. Every effectiveness figure is scored against these."""

    #: Share of work that should be planned rather than reactive. 80/20 is the
    #: figure the maintenance literature settles on for a mature programme.
    planned_ratio: float = 0.80
    #: Share of due work completed on or before its due date.
    schedule_compliance: float = 0.90
    #: Mean time to restore, in minutes.
    mttr_minutes: float = 240.0
    #: Operational availability.
    availability_pct: float = 97.0
    #: Asset health index below which an asset is reported as at risk.
    health_index_floor: float = 70.0
    #: Technician hours available per week, used to express the backlog as weeks
    #: of work rather than as a count nobody can size.
    weekly_labour_hours: float = 60.0
    #: Share of closed work that comes back — the rework rate ceiling.
    rework_rate: float = 0.05


# ── Aggregate ────────────────────────────────────────────────────────────


@dataclass
class ApmConfig:
    """The module's whole configuration, held as one replaceable object."""

    criticality: CriticalityWeights = None  # type: ignore[assignment]
    health_index: HealthIndexWeights = None  # type: ignore[assignment]
    cost: CostModel = None  # type: ignore[assignment]
    targets: MaintenanceTargets = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.criticality = (self.criticality or CriticalityWeights()).normalised()
        self.health_index = (self.health_index or HealthIndexWeights()).normalised()
        self.cost = self.cost or CostModel()
        self.targets = self.targets or MaintenanceTargets()

    # ── Runtime reconfiguration ─────────────────────────────────────────

    def set_criticality_weights(self, weights: dict[str, float]) -> CriticalityWeights:
        """Replace some or all criticality weights, then renormalise.

        Unknown keys are ignored rather than rejected: the caller is an operator
        adjusting a model, and a typo should not blank the estate's consequence
        scoring.
        """
        accepted = {
            key: float(value)
            for key, value in weights.items()
            if key in CRITICALITY_FACTORS and float(value) >= 0.0
        }
        if accepted:
            self.criticality = replace(self.criticality, **accepted).normalised()
        return self.criticality

    def set_health_index_weights(self, weights: dict[str, float]) -> HealthIndexWeights:
        known = set(self.health_index.as_dict())
        accepted = {
            key: float(value)
            for key, value in weights.items()
            if key in known and float(value) >= 0.0
        }
        if accepted:
            self.health_index = replace(self.health_index, **accepted).normalised()
        return self.health_index

    def set_targets(self, values: dict[str, float]) -> MaintenanceTargets:
        known = {field for field in MaintenanceTargets.__dataclass_fields__}
        accepted = {
            key: float(value) for key, value in values.items() if key in known and float(value) > 0.0
        }
        if accepted:
            self.targets = replace(self.targets, **accepted)
        return self.targets

    def set_cost_model(self, values: dict[str, float]) -> CostModel:
        """Adjust the scalar terms of the cost model.

        The catalogues — part costs, brand premiums, lead times — are reference
        data rather than a tunable, so they are not exposed here.
        """
        scalars = (
            "labour_rate_per_hour",
            "reactive_labour_multiplier",
            "work_order_overhead",
            "secondary_damage_share",
            "repair_replace_threshold",
        )
        accepted = {
            key: float(value) for key, value in values.items() if key in scalars and float(value) >= 0.0
        }
        if accepted:
            self.cost = replace(self.cost, **accepted)
        return self.cost

    def as_dict(self) -> dict:
        return {
            "criticality_weights": self.criticality.as_dict(),
            "health_index_weights": self.health_index.as_dict(),
            "targets": {
                field: getattr(self.targets, field)
                for field in MaintenanceTargets.__dataclass_fields__
            },
            "cost": {
                "currency": self.cost.currency,
                "labour_rate_per_hour": self.cost.labour_rate_per_hour,
                "reactive_labour_multiplier": self.cost.reactive_labour_multiplier,
                "work_order_overhead": self.cost.work_order_overhead,
                "secondary_damage_share": self.cost.secondary_damage_share,
                "repair_replace_threshold": self.cost.repair_replace_threshold,
                "downtime_rate_per_hour": dict(self.cost.downtime_rate_per_hour),
                "lead_time_days": dict(self.cost.lead_time_days),
            },
            "rul_adequacy_days": RUL_ADEQUACY_DAYS,
            "criticality_classes": [
                {"code": code, "label": label, "min_score": minimum}
                for minimum, code, label in CRITICALITY_CLASSES
            ],
        }


#: Module singleton. Held here so a weighting change made through the API is
#: visible to the next analytics pass without threading configuration through
#: every call site.
apm_config = ApmConfig()


def get_apm_config() -> ApmConfig:
    return apm_config
