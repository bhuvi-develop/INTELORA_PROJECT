"""Reliability arithmetic.

Availability, MTBF, MTTR, failure rate and downtime, all measured rather than
modelled, and all computed over one explicitly stated window so two figures on
the same screen cannot be quoting different spans of time.

Three decisions matter here and are the reason this module exists rather than
APM reading the platform's existing performance figures:

**A failure is not an anomaly.** Anomaly Detection raises Info and Warning events
for deviations that never took the asset out of service. Counting those as
failures inflates the failure rate and deflates MTBF, and a maintenance
programme planned against that number buys work nobody needed. Only Critical and
Major events are counted as functional failures.

**MTBF is uptime over failures in the same window.** The platform's existing
figure divides cumulative runtime by a rolling 24-hour anomaly count, which mixes
spans and grows without bound. That figure is left untouched — OEE reads it — and
APM computes its own from `online_seconds` and the events raised over the same
observation period.

**A mean with no observations is not zero.** An asset that has never failed has
an MTBF of *at least* its uptime, not exactly its uptime, and one whose only
failure is still open has no MTTR at all. Both cases are published with a
`censored` flag rather than as a confident number, because a fleet average that
silently absorbs placeholder zeros is worse than one that admits what it does not
know.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.mock_data.signals import clamp, clamp01
from app.services.anomaly_service import AnomalyEvent
from app.services.derive import availability_from_uptime
from app.services.simulator import AssetState

#: Severities that constitute a functional failure. A link loss is always
#: Critical, so an unreachable asset is correctly counted as having failed.
FAILURE_SEVERITIES: frozenset[str] = frozenset({"Critical", "Major"})

#: Hours per week, used to express failure rate in a unit maintenance planners
#: recognise.
HOURS_PER_1000 = 1000.0

#: Operating hours below which a failure *rate* is not a statistic.
#:
#: A rate is a count divided by exposure, and dividing by a small exposure
#: produces a number with the right units and no information: three events in
#: forty minutes extrapolates to 4,865 failures per thousand hours, which is
#: arithmetically correct and worthless. Published rates below this exposure are
#: flagged, and consumers that weight the rate as evidence must drop it rather
#: than believe it — in either direction, because a spurious *zero* is just as
#: misleading as a spurious spike.
MIN_EXPOSURE_HOURS = 6.0


@dataclass(frozen=True)
class ReliabilityResult:
    asset_id: str

    #: Hours the asset has been observed by the platform, online or not.
    observed_hours: float
    #: Hours it was reachable and reporting.
    uptime_hours: float
    #: Hours it was observed but not reporting. Measured, not inferred.
    downtime_hours: float
    #: Number of distinct periods the asset was unreachable.
    downtime_events: int

    #: Observed uptime over observed time. The same definition the platform and
    #: OEE already use, recomputed here so APM's own record is self-contained.
    availability_pct: float
    #: MTBF / (MTBF + MTTR). What availability would settle at given the measured
    #: failure and repair behaviour, independent of how long the asset happens to
    #: have been watched.
    inherent_availability_pct: float

    #: Functional failures — Critical and Major events only.
    failures: int
    #: Every anomaly raised in the window, failure or not. Published so a
    #: consumer can see the ratio rather than having to trust the filter.
    anomalies: int

    mtbf_hours: float
    #: True when there were no failures, so MTBF is a lower bound.
    mtbf_censored: bool
    mttr_minutes: float
    #: True when no failure has closed yet, so MTTR is unknown.
    mttr_censored: bool

    #: Failures per thousand operating hours.
    failure_rate_per_1000h: float
    #: True when the asset has been observed long enough for that rate to mean
    #: something. When false the rate is published for transparency but must not
    #: be weighted as evidence.
    rate_credible: bool
    #: Expected failures over the next thirty days at the measured rate.
    projected_failures_30d: float

    #: Open failure events at the instant this was computed.
    open_failures: int
    #: Minutes the oldest open failure has been outstanding.
    longest_open_minutes: float

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "observed_hours": self.observed_hours,
            "uptime_hours": self.uptime_hours,
            "downtime_hours": self.downtime_hours,
            "downtime_events": self.downtime_events,
            "availability_pct": self.availability_pct,
            "inherent_availability_pct": self.inherent_availability_pct,
            "failures": self.failures,
            "anomalies": self.anomalies,
            "mtbf_hours": self.mtbf_hours,
            "mtbf_censored": self.mtbf_censored,
            "mttr_minutes": self.mttr_minutes,
            "mttr_censored": self.mttr_censored,
            "failure_rate_per_1000h": self.failure_rate_per_1000h,
            "rate_credible": self.rate_credible,
            "projected_failures_30d": self.projected_failures_30d,
            "open_failures": self.open_failures,
            "longest_open_minutes": self.longest_open_minutes,
        }


def is_failure(event: AnomalyEvent) -> bool:
    """Whether an AD event took the asset out of service."""
    return event.severity in FAILURE_SEVERITIES


def compute(
    state: AssetState,
    events: list[AnomalyEvent],
    now: datetime,
) -> ReliabilityResult:
    """Reliability figures for one asset over the platform's observation window.

    `events` is that asset's slice of the detector journal. The window is the same
    for both inputs — `online_seconds` and the journal are both accumulated since
    the engine started — which is what makes the division meaningful.
    """
    observed_hours = state.observed_seconds / 3600.0
    uptime_hours = state.online_seconds / 3600.0
    downtime_hours = max(0.0, observed_hours - uptime_hours)

    failures = [event for event in events if is_failure(event)]
    closed = [event for event in failures if event.resolved_at is not None]
    open_failures = [event for event in failures if event.resolved_at is None]

    # A communication loss is the platform's record of an unreachable period, so
    # the count of those events is the count of distinct downtime periods.
    downtime_events = sum(1 for event in events if event.anomaly_type == "communication-lost")

    failure_count = len(failures)

    if failure_count > 0:
        mtbf = round(uptime_hours / failure_count, 2)
        mtbf_censored = False
    else:
        # No failure yet: MTBF is at least the whole observed uptime.
        mtbf = round(uptime_hours, 2)
        mtbf_censored = True

    if closed:
        mttr = round(sum(event.minutes_open(now) for event in closed) / len(closed), 2)
        mttr_censored = False
    else:
        mttr = 0.0
        mttr_censored = True

    availability = availability_from_uptime(state.uptime_ratio)

    # Inherent availability. With no closed repair to measure, the measured
    # availability is the honest answer rather than a 100% produced by a zero
    # repair time.
    if mttr_censored or mtbf <= 0.0:
        inherent = availability
    else:
        mttr_hours = mttr / 60.0
        inherent = round(clamp01(mtbf / (mtbf + mttr_hours)) * 100.0, 1)

    failure_rate = round(failure_count / uptime_hours * HOURS_PER_1000, 3) if uptime_hours > 0 else 0.0

    return ReliabilityResult(
        asset_id=state.asset_id,
        observed_hours=round(observed_hours, 3),
        uptime_hours=round(uptime_hours, 3),
        downtime_hours=round(downtime_hours, 3),
        downtime_events=downtime_events,
        availability_pct=availability,
        inherent_availability_pct=inherent,
        failures=failure_count,
        anomalies=len(events),
        mtbf_hours=mtbf,
        mtbf_censored=mtbf_censored,
        mttr_minutes=mttr,
        mttr_censored=mttr_censored,
        failure_rate_per_1000h=failure_rate,
        rate_credible=uptime_hours >= MIN_EXPOSURE_HOURS,
        # 30 days is 720 hours of calendar time; at the measured availability the
        # asset only accrues operating hours for part of it.
        projected_failures_30d=round(failure_rate / HOURS_PER_1000 * 720.0 * (availability / 100.0), 3),
        open_failures=len(open_failures),
        longest_open_minutes=round(
            max((event.minutes_open(now) for event in open_failures), default=0.0), 2
        ),
    )


@dataclass(frozen=True)
class FleetReliability:
    """Estate-level reliability.

    Censored assets are excluded from the MTBF and MTTR means rather than
    entered as zero: an estate where nothing has failed yet should report that it
    has no measured MTBF, not an MTBF of zero hours.
    """

    assets: int
    availability_pct: float
    inherent_availability_pct: float
    total_downtime_hours: float
    total_failures: int
    #: Assets contributing a measured MTBF.
    mtbf_sample: int
    mtbf_hours: float
    #: Assets contributing a measured MTTR.
    mttr_sample: int
    mttr_minutes: float
    failure_rate_per_1000h: float
    #: True when the estate's *pooled* exposure is enough for the rate to mean
    #: something. Pooling helps: twenty-four assets watched for an hour each is a
    #: credible sample where any one of them alone is not.
    rate_credible: bool
    #: Assets with at least one failure outstanding.
    assets_with_open_failures: int
    #: Assets below the availability target.
    assets_below_target: int

    def as_dict(self) -> dict:
        return {
            "assets": self.assets,
            "availability_pct": self.availability_pct,
            "inherent_availability_pct": self.inherent_availability_pct,
            "total_downtime_hours": self.total_downtime_hours,
            "total_failures": self.total_failures,
            "mtbf_sample": self.mtbf_sample,
            "mtbf_hours": self.mtbf_hours,
            "mttr_sample": self.mttr_sample,
            "mttr_minutes": self.mttr_minutes,
            "failure_rate_per_1000h": self.failure_rate_per_1000h,
            "rate_credible": self.rate_credible,
            "assets_with_open_failures": self.assets_with_open_failures,
            "assets_below_target": self.assets_below_target,
        }


def rollup(results: list[ReliabilityResult], availability_target: float) -> FleetReliability:
    if not results:
        return FleetReliability(
            assets=0,
            availability_pct=0.0,
            inherent_availability_pct=0.0,
            total_downtime_hours=0.0,
            total_failures=0,
            mtbf_sample=0,
            mtbf_hours=0.0,
            mttr_sample=0,
            mttr_minutes=0.0,
            failure_rate_per_1000h=0.0,
            rate_credible=False,
            assets_with_open_failures=0,
            assets_below_target=0,
        )

    count = len(results)
    measured_mtbf = [entry.mtbf_hours for entry in results if not entry.mtbf_censored]
    measured_mttr = [entry.mttr_minutes for entry in results if not entry.mttr_censored]

    total_uptime = sum(entry.uptime_hours for entry in results)
    total_failures = sum(entry.failures for entry in results)

    return FleetReliability(
        assets=count,
        availability_pct=round(sum(entry.availability_pct for entry in results) / count, 1),
        inherent_availability_pct=round(
            sum(entry.inherent_availability_pct for entry in results) / count, 1
        ),
        total_downtime_hours=round(sum(entry.downtime_hours for entry in results), 3),
        total_failures=total_failures,
        mtbf_sample=len(measured_mtbf),
        mtbf_hours=round(sum(measured_mtbf) / len(measured_mtbf), 2) if measured_mtbf else 0.0,
        mttr_sample=len(measured_mttr),
        mttr_minutes=round(sum(measured_mttr) / len(measured_mttr), 2) if measured_mttr else 0.0,
        # Fleet failure rate is pooled failures over pooled hours, not the mean of
        # per-asset rates: a rate is not additive, and averaging rates over
        # unequal exposure over-weights the asset that has been watched least.
        failure_rate_per_1000h=round(total_failures / total_uptime * HOURS_PER_1000, 3)
        if total_uptime > 0
        else 0.0,
        rate_credible=total_uptime >= MIN_EXPOSURE_HOURS,
        assets_with_open_failures=sum(1 for entry in results if entry.open_failures > 0),
        assets_below_target=sum(
            1 for entry in results if entry.availability_pct < availability_target
        ),
    )


def downtime_cost(downtime_hours: float, rate_per_hour: float) -> float:
    """What the measured downtime cost, at this asset's criticality class."""
    return round(max(0.0, downtime_hours) * max(0.0, rate_per_hour), 2)


def utilisation(state: AssetState, availability_pct: float) -> float:
    """Share of the asset's rated capability the estate actually took from it.

    Distinct from availability: an asset can be perfectly reachable and sitting
    in standby, which is capacity the estate paid for and got nothing from.

    Derived from the cumulative meters — energy against runtime — rather than from
    the instantaneous load, because a figure sampled at one tick would swing with
    whichever operating mode the asset happened to be in when it was read. Both
    meters survive a restart together, so the ratio stays honest across one.

    OEE consumes this. It is computed here and nowhere else.
    """
    rated_kw = state.profile.rated_power_w / 1000.0
    if state.runtime_hours <= 0.0 or rated_kw <= 0.0:
        return 0.0
    #: Mean load factor over everything the asset has ever run.
    load_factor = clamp01((state.energy_kwh / state.runtime_hours) / rated_kw)
    return round(clamp(load_factor * clamp01(availability_pct / 100.0) * 100.0, 0.0, 100.0), 1)
