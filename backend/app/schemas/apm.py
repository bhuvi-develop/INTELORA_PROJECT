from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class CriticalityScore(BaseModel):
    asset_id: str
    business_impact: str
    downtime_cost_per_hour: float
    criticality_rank: int

class ReliabilityMetrics(BaseModel):
    asset_id: str
    mtbf_hours: float
    mttr_hours: float
    failure_rate_percentage: float

class WorkOrder(BaseModel):
    order_id: str
    asset_id: str
    title: str
    status: str
    priority: str
    created_at: datetime
    scheduled_for: Optional[datetime]
    cost_estimate: float
    
class CostLedger(BaseModel):
    asset_id: str
    maintenance_cost_ytd: float
    roi_percentage: float

"""Asset Performance Management payloads.

Additive. The existing `ApmResponse` in `schemas.analysis` is untouched and its
endpoint still serves it — OEE and the fleet-ranking view read that shape, and
changing it would break two modules to tidy one.

Response models here are deliberately shallow over deep composite blocks: the
per-asset record carries its decomposition — criticality factors, health-index
terms, risk signals — as typed sub-objects where a consumer reads them
individually, and as free dictionaries where they exist only to be displayed
whole. Declaring every nested breakdown as a strict model would add several
hundred lines that assert nothing the calculation layer has not already
guaranteed.

Request models are the opposite: strictly bounded, because they are the only
place in the module where a value arrives from outside it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import ApiModel, Criticality, HealthBand, Meta, RiskTier

# ── Enumerations, mirroring the service layer ────────────────────────────

CriticalityCode = Literal["A", "B", "C", "D"]
PriorityCode = Literal["P1", "P2", "P3", "P4"]
LifecycleDecision = Literal["repair", "replace", "monitor", "run-to-failure"]
WorkOrderType = Literal[
    "Corrective", "Preventive", "Predictive", "Inspection", "Replacement", "Calibration"
]
WorkOrderOrigin = Literal["anomaly", "prediction", "schedule", "recommendation", "manual"]
WorkOrderStatus = Literal[
    "Draft",
    "Raised",
    "Approved",
    "Assigned",
    "Dispatched",
    "InProgress",
    "Completed",
    "Verified",
    "Closed",
    "Rejected",
    "Cancelled",
    "OnHold",
]
Resolution = Literal["Resolved", "Replaced", "Deferred", "No-Fault-Found", "Not-Reproduced"]
HierarchyLevel = Literal[
    "enterprise", "portfolio", "site", "floor", "zone", "asset", "sensor"
]


# ── Decomposition blocks ─────────────────────────────────────────────────


class CriticalityFactorOut(ApiModel):
    key: str
    label: str
    #: 1–5, where 5 is the worst consequence.
    score: float
    weight: float
    contribution: float
    basis: str


class HealthIndexTermOut(ApiModel):
    key: str
    label: str
    #: 0–1 satisfaction of this term.
    value: float
    weight: float
    contribution: float
    detail: str


# ── Per-asset record ─────────────────────────────────────────────────────


class ApmAssetOut(ApiModel):
    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    status: str
    device_uid: str

    #: The AD, PdM and Platform Core figures this record was computed from,
    #: published so the data flow can be audited rather than assumed.
    inputs: dict

    # ── Asset health index ───────────────────────────────────────────────
    health_index: float
    health_index_band: HealthBand
    health_index_confidence: float
    #: Index minus PdM's condition score. Negative means the asset is a worse
    #: asset than its parts are.
    condition_gap: float
    health_index_terms: list[HealthIndexTermOut]

    # ── Criticality ──────────────────────────────────────────────────────
    criticality_score: float
    criticality_code: CriticalityCode
    criticality_label: str
    #: The register's assigned label, for comparison with the computed class.
    assigned_criticality: Criticality
    criticality_factors: list[CriticalityFactorOut]

    # ── Reliability ──────────────────────────────────────────────────────
    availability_pct: float
    inherent_availability_pct: float
    mtbf_hours: float
    #: True when there were no failures, so MTBF is a lower bound not a mean.
    mtbf_censored: bool
    mttr_minutes: float
    #: True when no failure has closed, so MTTR is unknown rather than zero.
    mttr_censored: bool
    failure_rate_per_1000h: float
    failures: int
    open_failures: int
    downtime_hours: float
    downtime_events: int
    downtime_cost: float
    utilisation_pct: float

    # ── Age ──────────────────────────────────────────────────────────────
    effective_age_days: float
    #: Effective age over calendar age. Above one, the asset is ageing faster
    #: than the calendar.
    ageing_factor: float
    calendar_age_days: float

    # ── Risk and priority ────────────────────────────────────────────────
    risk_score: float
    risk_tier: RiskTier
    risk_label: str
    #: 'probability', 'consequence' or 'balanced' — which half explains the score.
    risk_driver: str
    risk_signals: dict
    priority_score: float
    priority_code: PriorityCode
    priority: str
    response_target_hours: float

    # ── Money ────────────────────────────────────────────────────────────
    cost_exposure: float
    exposure_breakdown: dict
    repair_estimate: dict

    # ── Decisions ────────────────────────────────────────────────────────
    lifecycle_decision: LifecycleDecision
    lifecycle: dict
    recommended_action: dict

    open_work_orders: int
    work_order_ids: list[str]

    #: Positions in the estate. Three orderings, because condition, exposure and
    #: queue position are three different questions.
    health_index_rank: int
    risk_rank: int
    priority_rank: int


class TierCountOut(ApiModel):
    tier: str
    label: str
    count: int
    share_pct: float


class ClassCountOut(ApiModel):
    code: str
    label: str
    count: int
    share_pct: float


class ApmOverviewResponse(ApiModel):
    """The APM module's whole estate view in one request.

    A single call by design, for the same reason the dashboard is: a page
    assembled from eight parallel requests can render eight different instants of
    the estate.
    """

    assets: list[ApmAssetOut]
    #: Aggregates over the *filtered* subset, so a scoped view needs no
    #: arithmetic in the browser. Equal to the estate figures when unfiltered.
    scope: dict
    fleet_health: dict
    fleet_reliability: dict
    economics: dict
    backlog: dict
    effectiveness: dict
    risk_distribution: list[TierCountOut]
    criticality_distribution: list[ClassCountOut]
    lifecycle_distribution: dict[str, int]
    total: int
    returned: int
    #: Configuration the figures were computed under, so a consumer can see which
    #: weighting produced them.
    config: dict
    meta: Meta


# ── Work orders ──────────────────────────────────────────────────────────


class TransitionOut(ApiModel):
    at: datetime
    from_status: str
    to_status: str
    actor: str
    note: str | None


class WorkOrderOut(ApiModel):
    work_order_id: str
    asset_id: str
    asset_name: str
    category: str
    component: str | None

    work_order_type: WorkOrderType
    origin: WorkOrderOrigin
    #: True when the work was scheduled rather than forced by a failure. The
    #: planned-versus-reactive ratio is computed from this field.
    planned: bool

    title: str
    description: str

    priority: str
    priority_code: PriorityCode
    priority_score: float
    criticality_code: CriticalityCode
    risk_score: float

    status: WorkOrderStatus
    is_open: bool

    raised_at: datetime
    due_at: datetime | None
    approved_at: datetime | None
    assigned_at: datetime | None
    dispatched_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    verified_at: datetime | None
    closed_at: datetime | None

    assignee: str | None
    approver: str | None
    rejection_reason: str | None

    estimated_cost: float
    estimated_hours: float
    actual_cost: float | None
    actual_hours: float | None
    downtime_hours: float

    resolution: Resolution | None
    root_cause: str | None
    parts_replaced: list[str]
    findings: str | None
    verified_by: str | None
    #: True when signed-off work came back. This is the rework rate.
    rework: bool

    anomaly_uids: list[str]
    outcome_published: bool

    age_days: float
    overdue: bool
    days_until_due: float | None
    #: Raise to dispatch, in minutes.
    response_minutes: float | None
    #: Start to completion — hands-on time, not queue time.
    repair_minutes: float | None
    #: Raise to close. What the requester actually waited.
    cycle_minutes: float | None
    #: Whether it was finished by its due date. Null while still open.
    on_time: bool | None

    history: list[TransitionOut]


class WorkOrderListResponse(ApiModel):
    work_orders: list[WorkOrderOut]
    total: int
    returned: int
    backlog: dict
    effectiveness: dict
    by_status: dict[str, int]
    by_priority: dict[str, int]
    meta: Meta


class WorkOrderResponse(ApiModel):
    work_order: WorkOrderOut
    meta: Meta


# ── Work order requests ──────────────────────────────────────────────────


class WorkOrderCreate(ApiModel):
    """A manually raised work order.

    Priority is not accepted from the caller. APM scores it from the asset's own
    risk, condition and criticality — a requester-chosen priority is how every
    order in a CMMS becomes urgent.
    """

    asset_id: str = Field(min_length=1, max_length=32)
    work_order_type: WorkOrderType
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    component: str | None = Field(default=None, max_length=80)
    origin: WorkOrderOrigin = "manual"
    #: Overrides the planned/reactive classification implied by the origin.
    planned: bool | None = None
    estimated_cost: float | None = Field(default=None, ge=0.0, le=1_000_000.0)
    estimated_hours: float | None = Field(default=None, ge=0.0, le=1000.0)
    anomaly_uids: list[str] = Field(default_factory=list, max_length=50)
    raised_by: str = Field(default="operator", min_length=1, max_length=80)


class ApprovalRequest(ApiModel):
    approver: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=1000)


class RejectionRequest(ApiModel):
    approver: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=3, max_length=1000)


class AssignRequest(ApiModel):
    assignee: str = Field(min_length=1, max_length=80)
    actor: str = Field(default="planner", min_length=1, max_length=80)
    #: Dispatch in the same call. Assigning and dispatching are separate states
    #: because the gap between them is queue time worth measuring, but a small
    #: team does both at once and should not need two requests.
    dispatch: bool = False


class ActorRequest(ApiModel):
    actor: str = Field(default="operator", min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=1000)


class CompletionRequest(ApiModel):
    actor: str = Field(default="technician", min_length=1, max_length=80)
    resolution: Resolution = "Resolved"
    root_cause: str | None = Field(default=None, max_length=2000)
    parts_replaced: list[str] = Field(default_factory=list, max_length=30)
    findings: str | None = Field(default=None, max_length=4000)
    actual_cost: float | None = Field(default=None, ge=0.0, le=1_000_000.0)
    actual_hours: float | None = Field(default=None, ge=0.0, le=1000.0)
    downtime_hours: float | None = Field(default=None, ge=0.0, le=100_000.0)


class VerificationRequest(ApiModel):
    verified_by: str = Field(min_length=1, max_length=80)
    findings: str | None = Field(default=None, max_length=4000)
    #: False sends the work back to the technician, which is the rework path.
    accepted: bool = True
    reason: str | None = Field(default=None, max_length=1000)


class HoldRequest(ApiModel):
    actor: str = Field(default="planner", min_length=1, max_length=80)
    reason: str = Field(min_length=3, max_length=1000)


# ── Configuration ────────────────────────────────────────────────────────


class CriticalityWeightUpdate(ApiModel):
    """Criticality weights. Any subset; the model renormalises what it is given.

    Weights are non-negative and bounded above by one before normalisation, which
    is enough to reject a typo without pretending the caller must supply a
    complete, already-normalised set.
    """

    safety: float | None = Field(default=None, ge=0.0, le=1.0)
    production_impact: float | None = Field(default=None, ge=0.0, le=1.0)
    replacement_cost: float | None = Field(default=None, ge=0.0, le=1.0)
    lead_time: float | None = Field(default=None, ge=0.0, le=1.0)
    redundancy: float | None = Field(default=None, ge=0.0, le=1.0)
    business_impact: float | None = Field(default=None, ge=0.0, le=1.0)

    def supplied(self) -> dict[str, float]:
        return {key: value for key, value in self.model_dump().items() if value is not None}

    @field_validator("*")
    @classmethod
    def _reject_all_zero(cls, value: float | None) -> float | None:
        return value


class HealthIndexWeightUpdate(ApiModel):
    condition: float | None = Field(default=None, ge=0.0, le=1.0)
    reliability: float | None = Field(default=None, ge=0.0, le=1.0)
    alarm: float | None = Field(default=None, ge=0.0, le=1.0)
    life: float | None = Field(default=None, ge=0.0, le=1.0)
    integrity: float | None = Field(default=None, ge=0.0, le=1.0)

    def supplied(self) -> dict[str, float]:
        return {key: value for key, value in self.model_dump().items() if value is not None}


class TargetUpdate(ApiModel):
    planned_ratio: float | None = Field(default=None, gt=0.0, le=1.0)
    schedule_compliance: float | None = Field(default=None, gt=0.0, le=1.0)
    mttr_minutes: float | None = Field(default=None, gt=0.0, le=100_000.0)
    availability_pct: float | None = Field(default=None, gt=0.0, le=100.0)
    health_index_floor: float | None = Field(default=None, gt=0.0, le=100.0)
    weekly_labour_hours: float | None = Field(default=None, gt=0.0, le=10_000.0)
    rework_rate: float | None = Field(default=None, gt=0.0, le=1.0)

    def supplied(self) -> dict[str, float]:
        return {key: value for key, value in self.model_dump().items() if value is not None}


class CostModelUpdate(ApiModel):
    labour_rate_per_hour: float | None = Field(default=None, ge=0.0, le=100_000.0)
    reactive_labour_multiplier: float | None = Field(default=None, ge=1.0, le=10.0)
    work_order_overhead: float | None = Field(default=None, ge=0.0, le=100_000.0)
    secondary_damage_share: float | None = Field(default=None, ge=0.0, le=1.0)
    repair_replace_threshold: float | None = Field(default=None, ge=0.0, le=1.0)

    def supplied(self) -> dict[str, float]:
        return {key: value for key, value in self.model_dump().items() if value is not None}


class ApmConfigUpdate(ApiModel):
    criticality_weights: CriticalityWeightUpdate | None = None
    health_index_weights: HealthIndexWeightUpdate | None = None
    targets: TargetUpdate | None = None
    cost: CostModelUpdate | None = None


class ApmConfigResponse(ApiModel):
    config: dict
    #: True when the change invalidated the cached pass, so the caller knows the
    #: next read reflects it.
    recomputed: bool
    meta: Meta


# ── Hierarchy ────────────────────────────────────────────────────────────


class HierarchyNodeOut(ApiModel):
    node_id: str
    level: HierarchyLevel
    name: str
    assets: int
    health_index: float
    criticality_score: float
    risk_score: float
    availability_pct: float
    downtime_hours: float
    cost_exposure: float
    open_work_orders: int
    critical_assets: int
    asset_ids: list[str]
    children: list["HierarchyNodeOut"] = []


class HierarchyResponse(ApiModel):
    root: HierarchyNodeOut
    levels: list[str]
    #: Note on how the hierarchy is derived. Published because the levels are
    #: projected from the register rather than stored on it, and a consumer is
    #: entitled to know that.
    derivation: dict[str, str]
    meta: Meta


# ── Downstream contracts ─────────────────────────────────────────────────


class OeeInputsResponse(ApiModel):
    """What APM publishes for OEE.

    Availability, condition, maintenance state, downtime and utilisation. No
    performance, quality or effectiveness figure appears here — those are OEE's to
    compute, and a second source for them is exactly what this boundary prevents.
    """

    assets: list[dict]
    fleet: dict
    computed_at: datetime
    analytics_tick: int
    meta: Meta


class ExecutiveOutputsResponse(ApiModel):
    asset_health: dict
    critical_assets: list[dict]
    maintenance_cost: dict
    backlog: dict
    risk: dict
    roi: dict
    cost_exposure: dict
    maintenance_kpis: dict
    reliability_kpis: dict
    work_order_status: dict
    lifecycle_distribution: dict[str, int]
    computed_at: datetime
    analytics_tick: int
    meta: Meta


class OutcomeResponse(ApiModel):
    """Confirmed work outcomes, for AD and PdM to read back.

    A pull feed. APM never writes into another module's state; it publishes what
    it confirmed and the owning module decides what to do about it.
    """

    outcomes: list[dict]
    total: int
    #: Outcomes not yet acknowledged by a consumer.
    unpublished: int
    meta: Meta
