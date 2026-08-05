"""Payloads for the taxonomy-aware anomaly surface.

Ratios are `float | None` throughout, deliberately. A precision score computed
over zero events is not 0.0 — it is unknown, and a dashboard that renders 0.0%
there is making a claim the data does not support. Null is the honest wire value
and the client shows a dash.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel, Meta

FeedbackType = Literal["FALSE_POSITIVE", "CONFIRMED_TRUE", "ACCEPTED_RECOMMENDATION"]

EventStatus = Literal["ACTIVE", "ACKNOWLEDGED", "SELF_CLEARED", "FALSE_POSITIVE"]

EventSeverity = Literal["CRITICAL", "MAJOR", "WARNING", "INFO"]


# ── Status bar ───────────────────────────────────────────────────────────


class TopCategory(ApiModel):
    code: str = Field(description="Stored category code, e.g. ELECTRICAL")
    name: str = Field(description="Operator-facing label, e.g. Electrical Faults")
    count: int


class StatusBarResponse(ApiModel):
    live_status: str
    ping_latency_ms: float | None = Field(
        default=None,
        description="Mean measured ingest-to-stored latency over the most recent events, in ms",
    )
    active_events_count: int
    critical_events_count: int
    top_category: TopCategory | None = Field(
        default=None, description="argmax over the open queue; null when nothing is open"
    )
    active_failure_types_count: int = Field(description="COUNT(DISTINCT type_id) over the open queue")
    taxonomy_size: int = Field(description="Failure modes the classifier recognises")
    ingest_per_minute: float | None = None
    meta: Meta


# ── Classification breakdown ─────────────────────────────────────────────


class CategoryBreakdown(ApiModel):
    category: str = Field(description="Operator-facing label")
    category_code: str
    count: int
    devices: int
    critical: int
    classified: int = Field(description="Still holding — a standing fault")
    transient: int = Field(description="Cleared on its own inside the transient window")
    share_pct: float


class ClassificationBreakdownResponse(ApiModel):
    breakdown: list[CategoryBreakdown]
    total_open: int
    meta: Meta


# ── Engineering KPIs ─────────────────────────────────────────────────────


class KpiScope(ApiModel):
    category: str | None
    category_name: str
    window_hours: int
    events_in_scope: int


class PrecisionDetail(ApiModel):
    score: float | None
    evaluated: int
    true_positives: int
    false_positives: int
    confirmed_by_technician: int
    rejected_by_technician: int
    corroborated_by_ground_truth: int
    unwitnessed: int = Field(
        description="Counted as true positives for want of evidence either way — reported so the "
        "precision figure can be discounted by how much of it rests on nothing"
    )


class RecallDetail(ApiModel):
    score: float | None
    episodes: int = Field(description="Injected fault episodes reconstructed for the window")
    detected: int
    missed: int
    missed_devices: list[str] = Field(default_factory=list)
    ground_truth: str | None = None


class LatencyDetail(ApiModel):
    mean_ms: float | None
    p95_ms: float | None
    sla_pct: float | None
    samples: int
    measures: str | None = None


class HorizonDetail(ApiModel):
    horizon_hrs: float | None
    soonest_hrs: float | None
    model_confidence: float | None
    warned_devices: int


class AcceptanceDetail(ApiModel):
    acceptance_pct: float | None
    accepted: int
    outstanding: int
    self_cleared: int
    rejected: int
    explicitly_accepted: int


class ImpactDetail(ApiModel):
    cost_saved: float
    downtime_hours_avoided: float
    hardware_retained_value: float
    devices_retained: int
    events_actioned: int
    mean_time_to_clear_minutes: float
    assumed_downtime_rate_per_hour: float = Field(
        description="Assumed input — the platform measures no monetary rate"
    )
    assumed_unit_replacement_cost: float = Field(description="Assumed input")


class ConfidenceDetail(ApiModel):
    score: float | None
    precision_term: float | None
    recall_term: float | None
    telemetry_snr: float | None
    composition: str | None = None


class KpiDetail(ApiModel):
    precision: PrecisionDetail
    recall: RecallDetail
    latency: LatencyDetail
    horizon: HorizonDetail
    acceptance: AcceptanceDetail
    impact: ImpactDetail
    confidence: ConfidenceDetail


class EngineeringKpiResponse(ApiModel):
    scope: KpiScope

    precision_score: float | None
    recall_score: float | None
    mean_ttd_ms: float | None
    p95_ttd_ms: float | None
    sla_attainment_pct: float | None
    sla_target_ms: float
    prediction_horizon_hrs: float | None
    recommendation_acceptance_pct: float | None
    business_impact_cost_saved: float
    engineering_confidence_score: float | None

    detail: KpiDetail = Field(description="The terms behind each headline, so it can be checked")
    meta: Meta


# ── Feedback ─────────────────────────────────────────────────────────────


class FeedbackRequest(ApiModel):
    feedback_type: FeedbackType
    technician_id: str = Field(min_length=1, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)


class FeedbackResponse(ApiModel):
    logged: bool
    event_id: str
    feedback_type: FeedbackType
    event_status: EventStatus
    #: Recomputed after the write, so the caller does not need a second request.
    precision_score: float | None
    precision_detail: PrecisionDetail
    meta: Meta


# ── Journal ──────────────────────────────────────────────────────────────


class JournalEvent(ApiModel):
    id: str
    source_uid: str
    device_id: str
    category: str
    category_name: str
    type_id: str
    signature: str
    rule_expression: str | None
    dwell_seconds: float | None
    severity: EventSeverity
    status: EventStatus
    breach_magnitude: float
    telemetry_snapshot: dict[str, Any]
    mechanism: str | None = Field(
        default=None,
        description="Ground-truth cause where the estate injected one; null for an event raised on "
        "the estate's own behaviour",
    )
    ingest_latency_ms: float | None
    detected_at: datetime
    resolved_at: datetime | None


class JournalResponse(ApiModel):
    events: list[JournalEvent]
    total: int
    returned: int
    page: int
    limit: int
    pages: int
    meta: Meta


# ── Taxonomy reference ───────────────────────────────────────────────────


class TaxonomyRuleOut(ApiModel):
    type_id: str
    code: str
    name: str
    category: str
    category_name: str
    signature: str
    expression: str
    channel: str
    dwell_seconds: float
    clear_seconds: float
    detail: str
    open_count: int = Field(description="Events of this mode currently open")


class TaxonomyResponse(ApiModel):
    rules: list[TaxonomyRuleOut]
    clear_margin_pct: float = Field(
        description="Margin inside the limit a reading must return before an event may clear"
    )
    meta: Meta
