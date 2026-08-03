"""The money model.

Everything APM says about cost resolves to one of four figures, and each is
computed once, here:

    intervention cost   parts plus labour plus overhead for one job
    downtime cost       hours out of service at the asset's criticality rate
    cost exposure       failure probability times the consequence of failing
    maintenance spend   what was actually committed, planned and reactive

The distinction that makes the rest of the module worth having is between *spend*
and *exposure*. Spend is money already committed and is a fact. Exposure is money
the estate is standing to lose and is a probability times a consequence — it is
not a cost yet, and reporting the two in the same column is the fastest way to
lose a maintenance budget argument. They are separate fields with separate names
everywhere they appear.

Reactive work is priced above planned work for the same job, because it is:
call-out, overtime, the diagnosis a planned job already has, and the procurement
nobody scheduled. That multiplier is what makes the planned-versus-reactive ratio
an argument about money rather than about tidiness.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.mock_data.signals import clamp, clamp01
from app.services.apm.config import ApmConfig, get_apm_config

#: Component wear past which a part is treated as needing work in a repair
#: estimate. Below it the part is not what the job is about.
SERVICE_WEAR_THRESHOLD = 0.55

#: Share of the procurement lead time an asset is actually out of service for.
#: Not all of it: spares, loan units and workarounds cover part of the wait, and
#: charging the estate for the whole lead time would overstate every exposure in
#: the fleet.
LEAD_TIME_OUTAGE_SHARE = 0.25

#: Share of an asset's cost exposure that a timely intervention actually removes.
#: Not one: maintenance reduces risk, it does not abolish it, and an ROI computed
#: as though it did is the number that gets a programme cancelled when it fails
#: to materialise.
PREVENTION_EFFECTIVENESS = 0.75


@dataclass(frozen=True)
class InterventionCost:
    component: str
    parts: float
    labour_hours: float
    labour: float
    overhead: float
    total: float
    reactive: bool

    def as_dict(self) -> dict:
        return {
            "component": self.component,
            "parts": self.parts,
            "labour_hours": self.labour_hours,
            "labour": self.labour,
            "overhead": self.overhead,
            "total": self.total,
            "reactive": self.reactive,
        }


def intervention_cost(
    category: str,
    component: str,
    *,
    reactive: bool,
    config: ApmConfig | None = None,
) -> InterventionCost:
    """Cost of one job on one component."""
    settings = config or get_apm_config()
    model = settings.cost

    parts = model.part_cost(category, component)
    hours = model.labour_hours(category, component)
    rate = model.labour_rate_per_hour * (model.reactive_labour_multiplier if reactive else 1.0)
    labour = hours * rate

    return InterventionCost(
        component=component,
        parts=round(parts, 2),
        labour_hours=round(hours, 2),
        labour=round(labour, 2),
        overhead=round(model.work_order_overhead, 2),
        total=round(parts + labour + model.work_order_overhead, 2),
        reactive=reactive,
    )


@dataclass(frozen=True)
class RepairEstimate:
    """What it would take to put this asset back into good condition."""

    asset_id: str
    #: Parts at or past the service threshold, worst first.
    components: list[InterventionCost]
    #: Total if the work is scheduled.
    planned_total: float
    #: Total if the same work happens after a failure.
    reactive_total: float
    labour_hours: float
    #: The single part driving the estimate.
    primary_component: str

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "primary_component": self.primary_component,
            "planned_total": self.planned_total,
            "reactive_total": self.reactive_total,
            "labour_hours": self.labour_hours,
            "components": [entry.as_dict() for entry in self.components],
        }


def repair_estimate(
    asset_id: str,
    category: str,
    component_wear: list[tuple[str, float]],
    config: ApmConfig | None = None,
) -> RepairEstimate:
    """Cost to restore an asset, from the wear on its parts.

    Parts past the service threshold are all in scope. When nothing is past it,
    the estimate still prices the worst part, because the asset will need that
    part eventually and an estimate of zero is not useful to a planner.
    """
    settings = config or get_apm_config()
    ordered = sorted(component_wear, key=lambda entry: entry[1], reverse=True)

    if not ordered:
        return RepairEstimate(
            asset_id=asset_id,
            components=[],
            planned_total=0.0,
            reactive_total=0.0,
            labour_hours=0.0,
            primary_component="device",
        )

    in_scope = [name for name, wear in ordered if wear >= SERVICE_WEAR_THRESHOLD]
    if not in_scope:
        in_scope = [ordered[0][0]]

    planned = [intervention_cost(category, name, reactive=False, config=settings) for name in in_scope]
    reactive = [intervention_cost(category, name, reactive=True, config=settings) for name in in_scope]

    return RepairEstimate(
        asset_id=asset_id,
        components=planned,
        planned_total=round(sum(entry.total for entry in planned), 2),
        reactive_total=round(sum(entry.total for entry in reactive), 2),
        labour_hours=round(sum(entry.labour_hours for entry in planned), 2),
        primary_component=ordered[0][0],
    )


def expected_outage_hours(
    labour_hours: float,
    lead_time_days: float,
    measured_mttr_minutes: float,
    mttr_censored: bool,
) -> float:
    """How long a failure is expected to keep the asset out of service.

    The floor is the job itself plus a share of the procurement wait. Where the
    asset has a measured repair time and it is worse than that, the measurement
    wins — history beats an estimate.
    """
    modelled = labour_hours + lead_time_days * 24.0 * LEAD_TIME_OUTAGE_SHARE
    if mttr_censored:
        return round(modelled, 2)
    return round(max(modelled, measured_mttr_minutes / 60.0), 2)


@dataclass(frozen=True)
class CostExposure:
    """Money at risk, decomposed so an operator can see what drives it."""

    asset_id: str
    failure_probability: float
    #: Cost of the repair itself, at reactive rates.
    repair: float
    #: Cost of the hours the asset would be out.
    downtime: float
    #: Collateral damage a failure in service causes beyond the failed part.
    secondary: float
    #: Total consequence if it fails.
    consequence: float
    #: Consequence weighted by the probability of it happening in the horizon.
    exposure: float
    expected_outage_hours: float
    downtime_rate_per_hour: float
    #: What the same work costs if it is scheduled instead. The difference between
    #: this and the exposure is the case for doing it.
    planned_cost: float
    #: Exposure removed per unit of planned spend. Above one, the work pays.
    avoidance_ratio: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "failure_probability": self.failure_probability,
            "repair": self.repair,
            "downtime": self.downtime,
            "secondary": self.secondary,
            "consequence": self.consequence,
            "exposure": self.exposure,
            "expected_outage_hours": self.expected_outage_hours,
            "downtime_rate_per_hour": self.downtime_rate_per_hour,
            "planned_cost": self.planned_cost,
            "avoidance_ratio": self.avoidance_ratio,
        }


def cost_exposure(
    asset_id: str,
    *,
    failure_probability: float,
    estimate: RepairEstimate,
    replacement_cost: float,
    lead_time_days: float,
    downtime_rate_per_hour: float,
    measured_mttr_minutes: float,
    mttr_censored: bool,
    config: ApmConfig | None = None,
) -> CostExposure:
    """Cost exposure for one asset over the prediction horizon."""
    settings = config or get_apm_config()

    outage = expected_outage_hours(
        estimate.labour_hours, lead_time_days, measured_mttr_minutes, mttr_censored
    )
    downtime = outage * downtime_rate_per_hour
    secondary = replacement_cost * settings.cost.secondary_damage_share
    consequence = estimate.reactive_total + downtime + secondary

    probability = clamp01(failure_probability)
    exposure = probability * consequence
    planned = estimate.planned_total

    return CostExposure(
        asset_id=asset_id,
        failure_probability=round(probability, 4),
        repair=round(estimate.reactive_total, 2),
        downtime=round(downtime, 2),
        secondary=round(secondary, 2),
        consequence=round(consequence, 2),
        exposure=round(exposure, 2),
        expected_outage_hours=outage,
        downtime_rate_per_hour=round(downtime_rate_per_hour, 2),
        planned_cost=round(planned, 2),
        avoidance_ratio=round(exposure * PREVENTION_EFFECTIVENESS / planned, 2) if planned > 0 else 0.0,
    )


# ── Estate roll-up ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class MaintenanceEconomics:
    """The estate's maintenance economics, and the ROI that follows from them."""

    currency: str

    #: Spend already committed on closed work.
    committed_spend: float
    #: Spend committed on work that is planned but not yet done.
    planned_spend: float
    #: Spend on work that came from a failure rather than a schedule.
    reactive_spend: float
    #: Share of spend that was planned. The single most-quoted maintenance KPI.
    planned_spend_ratio: float

    #: Estimated cost of the whole outstanding backlog.
    backlog_cost: float
    #: Total exposure across the estate.
    total_exposure: float
    #: Exposure carried by assets with no work raised against them.
    unaddressed_exposure: float

    #: Measured downtime cost over the observation window.
    downtime_cost: float

    #: Exposure a timely programme would remove.
    avoidable_exposure: float
    #: (avoidable exposure − planned spend) / planned spend.
    roi: float
    #: Exposure removed per unit of total maintenance spend.
    return_per_unit_spend: float

    def as_dict(self) -> dict:
        return {
            "currency": self.currency,
            "committed_spend": self.committed_spend,
            "planned_spend": self.planned_spend,
            "reactive_spend": self.reactive_spend,
            "planned_spend_ratio": self.planned_spend_ratio,
            "backlog_cost": self.backlog_cost,
            "total_exposure": self.total_exposure,
            "unaddressed_exposure": self.unaddressed_exposure,
            "downtime_cost": self.downtime_cost,
            "avoidable_exposure": self.avoidable_exposure,
            "roi": self.roi,
            "return_per_unit_spend": self.return_per_unit_spend,
        }


def economics(
    *,
    exposures: list[CostExposure],
    addressed_asset_ids: set[str],
    committed_spend: float,
    planned_spend: float,
    reactive_spend: float,
    backlog_cost: float,
    downtime_cost_total: float,
    config: ApmConfig | None = None,
) -> MaintenanceEconomics:
    """Estate maintenance economics.

    `addressed_asset_ids` are the assets with a live work order against them.
    Their exposure is not counted as unaddressed, because somebody is already
    doing something about it — which is the whole point of tracking it.
    """
    settings = config or get_apm_config()

    total_exposure = sum(entry.exposure for entry in exposures)
    unaddressed = sum(
        entry.exposure for entry in exposures if entry.asset_id not in addressed_asset_ids
    )
    avoidable = total_exposure * PREVENTION_EFFECTIVENESS

    total_spend = committed_spend + planned_spend + reactive_spend
    planned_portion = committed_spend + planned_spend

    return MaintenanceEconomics(
        currency=settings.cost.currency,
        committed_spend=round(committed_spend, 2),
        planned_spend=round(planned_spend, 2),
        reactive_spend=round(reactive_spend, 2),
        planned_spend_ratio=round(planned_portion / total_spend, 4) if total_spend > 0 else 0.0,
        backlog_cost=round(backlog_cost, 2),
        total_exposure=round(total_exposure, 2),
        unaddressed_exposure=round(unaddressed, 2),
        downtime_cost=round(downtime_cost_total, 2),
        avoidable_exposure=round(avoidable, 2),
        # ROI against planned spend only. Reactive spend did not buy avoidance —
        # it paid for a failure that had already happened — so crediting it with
        # the exposure a planned programme removes would flatter the programme.
        roi=round((avoidable - planned_portion) / planned_portion, 3) if planned_portion > 0 else 0.0,
        return_per_unit_spend=round(avoidable / total_spend, 3) if total_spend > 0 else 0.0,
    )


def effective_age_days(
    component_wear: list[tuple[str, float, float]],
    calendar_age_days: float,
) -> tuple[float, float]:
    """Effective age of an asset, and the factor by which it is ageing.

    Calendar age says how long the estate has owned the asset. Effective age says
    how much of its service life it has actually spent, which is the figure that
    decides whether repairing it is worth doing. A hard-worked unit is older than
    its purchase date says, and a lightly used one is younger.

    Computed from the worst component rather than the mean: an asset is as old as
    the part that will retire it. Returns `(effective_age_days, ageing_factor)`,
    where the factor is effective over calendar — above one means the asset is
    ageing faster than the calendar.
    """
    if not component_wear:
        return 0.0, 1.0

    ages = [wear * life for _name, wear, life in component_wear if life > 0.0]
    if not ages:
        return 0.0, 1.0

    effective = max(ages)
    factor = effective / calendar_age_days if calendar_age_days > 0.0 else 1.0
    return round(effective, 1), round(clamp(factor, 0.0, 99.0), 2)
