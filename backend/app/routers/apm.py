"""Asset performance management.

The module's HTTP surface, in four groups:

    analysis     the estate view and its per-asset records, plus each calculation
                 family on its own endpoint for consumers that need one slice
    work orders  the lifecycle, one endpoint per documented transition
    outputs      the contracts APM owes OEE and the executive dashboard
    config       the criticality weighting and cost model, adjustable at runtime

The original two endpoints — the fleet ranking at the module root and the
head-to-head comparison — are unchanged. OEE and the existing ranking view read
that shape, and APM has no business breaking a contract to extend itself.

Nothing here computes a domain figure. Every number is assembled by the service
layer under `services/apm`; these functions select, filter and publish.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import ApmResponse
from app.schemas.apm import (
    ApmConfigResponse,
    ApmConfigUpdate,
    ApmOverviewResponse,
    ApprovalRequest,
    AssignRequest,
    ActorRequest,
    CompletionRequest,
    ExecutiveOutputsResponse,
    HierarchyResponse,
    HoldRequest,
    OeeInputsResponse,
    OutcomeResponse,
    RejectionRequest,
    VerificationRequest,
    WorkOrderCreate,
    WorkOrderListResponse,
    WorkOrderResponse,
)
from app.services.apm import cost as cost_model
from app.services.apm import repository
from app.services.apm import work_orders as wo
from app.services.apm.apm_service import (
    ApmService,
    ApmSnapshot,
    get_apm_service,
    scope_aggregate,
)
from app.services.apm.config import get_apm_config
from app.services.derive import OEE_TARGET
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/apm", tags=["Asset Performance"])


# ═══════════════════════════════════════════════════════════════════════════
# Original endpoints — unchanged
# ═══════════════════════════════════════════════════════════════════════════


@router.get("", response_model=ApmResponse, summary="Fleet performance comparison")
def read_apm(
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
) -> ApmResponse:
    analytics = engine.analytics
    ranking = analytics.ranking

    if category:
        ranking = [entry for entry in ranking if entry["category"] == category]
        # Re-rank inside the filtered set so the positions mean something.
        ranking = [{**entry, "rank": index + 1} for index, entry in enumerate(ranking)]

    below = [entry for entry in ranking if entry["oee"] < OEE_TARGET]

    return ApmResponse(
        ranking=ranking,
        categories=analytics.categories,
        leader=ranking[0] if ranking else None,
        laggard=ranking[-1] if ranking else None,
        fleet_average_oee=round(sum(entry["oee"] for entry in ranking) / len(ranking), 1)
        if ranking
        else 0.0,
        fleet_average_availability=round(
            sum(entry["availability"] for entry in ranking) / len(ranking), 1
        )
        if ranking
        else 0.0,
        assets_below_target=len(below),
        target=OEE_TARGET,
        meta=build_meta(engine),
    )


@router.get("/comparison", summary="Head-to-head comparison of selected assets")
def read_comparison(
    asset_ids: str = Query(description="Comma-separated asset ids"),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """Compare named assets on the factors that decide effectiveness."""
    wanted = [identifier.strip() for identifier in asset_ids.split(",") if identifier.strip()]
    ranking = {entry["asset_id"]: entry for entry in engine.analytics.ranking}

    return {
        "assets": [ranking[identifier] for identifier in wanted if identifier in ranking],
        "missing": [identifier for identifier in wanted if identifier not in ranking],
        "target": OEE_TARGET,
        "meta": build_meta(engine),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════════════


def _snapshot(engine: InteloraEngine, service: ApmService) -> ApmSnapshot:
    return service.snapshot(engine)


def _scoped(
    snapshot: ApmSnapshot,
    category: str | None = None,
    criticality: str | None = None,
    risk_tier: str | None = None,
    band: str | None = None,
    status_filter: str | None = None,
) -> list:
    """Apply the standard filter set to the per-asset records.

    One function so every endpoint filters identically — a category filter that
    means something different on two endpoints is a bug that only shows up when a
    user compares two screens.
    """
    return [
        record
        for record in snapshot.ordered
        if (category is None or record.category == category)
        and (criticality is None or record.criticality.code == criticality)
        and (risk_tier is None or record.risk.tier == risk_tier)
        and (band is None or record.health_index.band == band)
        and (status_filter is None or record.status == status_filter)
    ]


def _work_order_engine() -> wo.WorkOrderEngine:
    return wo.get_work_order_engine()


def _require_order(work_order_id: str) -> wo.WorkOrderRecord:
    record = _work_order_engine().get(work_order_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No work order {work_order_id}"
        )
    return record


def _transition(callable_, *args, **kwargs) -> wo.WorkOrderRecord:
    """Run a lifecycle move, turning an illegal one into a 409 rather than a 500.

    An illegal transition is a conflict with the order's current state, not a
    malformed request and not a server fault — the caller asked for something
    coherent that the lifecycle does not permit right now.
    """
    try:
        return callable_(*args, **kwargs)
    except wo.WorkOrderError as error:
        message = str(error)
        code = (
            status.HTTP_404_NOT_FOUND
            if message.startswith("No work order")
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=code, detail=message) from error


# ═══════════════════════════════════════════════════════════════════════════
# Analysis
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/overview", response_model=ApmOverviewResponse, summary="The whole APM estate view")
def read_overview(
    category: str | None = Query(default=None),
    criticality: str | None = Query(default=None, description="Criticality class A, B, C or D"),
    risk_tier: str | None = Query(default=None, description="critical, high, medium, low or healthy"),
    band: str | None = Query(default=None, description="Health index band"),
    asset_status: str | None = Query(default=None, alias="status"),
    sort: str = Query(
        default="priority",
        description="priority, risk, health_index, health, criticality, exposure or asset_id",
    ),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> ApmOverviewResponse:
    """Every APM figure for the estate in one request.

    The roll-ups are always computed over the *whole* estate, never over the
    filtered subset. A filtered view whose headline figures move with the filter
    cannot be compared against anything, and a user who filters to one category
    and reads "fleet availability" would be reading something else.
    """
    snapshot = _snapshot(engine, service)
    records = _scoped(snapshot, category, criticality, risk_tier, band, asset_status)

    orderings = {
        "priority": lambda record: -record.priority.score,
        "risk": lambda record: -record.risk.score,
        "health_index": lambda record: record.health_index.index,
        # Raw PdM condition, worst first. Distinct from health_index and offered
        # separately because a view labelled "lowest health" must order by the
        # figure it names, not by APM's composite over it.
        "health": lambda record: record.inputs["predictive"]["health_score"],
        "criticality": lambda record: -record.criticality.score,
        "exposure": lambda record: -record.exposure.exposure,
        "asset_id": lambda record: record.asset_id,
    }
    records = sorted(records, key=orderings.get(sort, orderings["priority"]))

    return ApmOverviewResponse(
        assets=[record.as_dict() for record in records],
        scope=scope_aggregate(records),
        fleet_health=snapshot.fleet_health.as_dict(),
        fleet_reliability=snapshot.fleet_reliability.as_dict(),
        economics=snapshot.economics.as_dict(),
        backlog=snapshot.backlog.as_dict(),
        effectiveness=snapshot.effectiveness.as_dict(),
        risk_distribution=snapshot.risk_distribution,
        criticality_distribution=snapshot.criticality_distribution,
        lifecycle_distribution=snapshot.lifecycle_distribution,
        total=len(snapshot.records),
        returned=len(records),
        config=get_apm_config().as_dict(),
        meta=build_meta(engine),
    )


@router.get("/health-index", summary="Asset health index across the estate")
def read_health_index(
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    """The APM composite over AD, PdM and Platform Core, with its decomposition."""
    snapshot = _snapshot(engine, service)
    records = _scoped(snapshot, category)

    return {
        "assets": [
            {
                "asset_id": record.asset_id,
                "asset_name": record.asset_name,
                "category": record.category,
                "health_index": record.health_index.index,
                "band": record.health_index.band,
                "confidence": record.health_index.confidence,
                "capped": record.health_index.capped,
                "condition_gap": record.health_index.condition_gap,
                "health_score": record.inputs["predictive"]["health_score"],
                "terms": [term.__dict__ for term in record.health_index.terms],
                "rank": record.health_index_rank,
            }
            for record in sorted(records, key=lambda item: item.health_index.index)
        ],
        "fleet": snapshot.fleet_health.as_dict(),
        "weights": get_apm_config().health_index.as_dict(),
        "meta": build_meta(engine),
    }


@router.get("/criticality", summary="Criticality scoring and its six factors")
def read_criticality(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    """The configurable consequence model, per asset and in aggregate.

    `assigned_criticality` is the register's hand-set label and
    `criticality_label` is what the model computes. Where they disagree, the
    disagreement is the point — a High-criticality label on an asset the model
    scores as C is a register entry worth revisiting.
    """
    snapshot = _snapshot(engine, service)
    records = snapshot.ordered

    disagreements = [
        record
        for record in records
        if record.criticality.label != record.criticality.assigned
    ]

    return {
        "assets": [
            record.criticality.as_dict()
            | {"asset_name": record.asset_name, "category": record.category}
            for record in sorted(records, key=lambda item: -item.criticality.score)
        ],
        "distribution": snapshot.criticality_distribution,
        "weights": get_apm_config().criticality.as_dict(),
        "disagreements": [
            {
                "asset_id": record.asset_id,
                "asset_name": record.asset_name,
                "assigned": record.criticality.assigned,
                "computed": record.criticality.label,
                "score": record.criticality.score,
            }
            for record in disagreements
        ],
        "meta": build_meta(engine),
    }


@router.get("/reliability", summary="Availability, MTBF, MTTR, failure rate and downtime")
def read_reliability(
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    snapshot = _snapshot(engine, service)
    records = _scoped(snapshot, category)
    config = get_apm_config()

    return {
        "assets": [
            record.reliability.as_dict()
            | {
                "asset_name": record.asset_name,
                "category": record.category,
                "utilisation_pct": record.utilisation_pct,
                "downtime_cost": record.downtime_cost,
            }
            for record in sorted(records, key=lambda item: item.reliability.availability_pct)
        ],
        "fleet": snapshot.fleet_reliability.as_dict(),
        "targets": {
            "availability_pct": config.targets.availability_pct,
            "mttr_minutes": config.targets.mttr_minutes,
        },
        # Published so a consumer knows why some figures are flagged rather than
        # quietly treating a censored lower bound as a measured mean.
        "censoring": {
            "min_exposure_hours": 6.0,
            "note": (
                "mtbf_censored means the asset has not failed, so MTBF is a lower bound. "
                "mttr_censored means no failure has closed, so MTTR is unknown rather than zero. "
                "rate_credible false means the observation window is too short for the failure "
                "rate to be a statistic; it is published but must not be weighted as evidence."
            ),
        },
        "meta": build_meta(engine),
    }


@router.get("/risk", summary="Risk scoring and its ranking")
def read_risk(
    tier: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    """Risk as probability times consequence, with both halves published."""
    snapshot = _snapshot(engine, service)
    records = _scoped(snapshot, risk_tier=tier)

    return {
        "assets": [
            record.risk.as_dict()
            | {
                "asset_name": record.asset_name,
                "category": record.category,
                "criticality_code": record.criticality.code,
                "health_index": record.health_index.index,
                "cost_exposure": record.exposure.exposure,
                "rank": record.risk_rank,
                "priority": record.priority.label,
                "priority_code": record.priority.code,
                "priority_score": record.priority.score,
                "recommended_action": record.action.as_dict(),
            }
            for record in sorted(records, key=lambda item: -item.risk.score)
        ],
        "distribution": snapshot.risk_distribution,
        "meta": build_meta(engine),
    }


@router.get("/cost", summary="Maintenance cost, downtime cost and cost exposure")
def read_cost(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    """The money view.

    Spend and exposure are separate blocks and separate fields. Spend is committed
    and is a fact; exposure is a probability times a consequence and is not a cost
    yet. Reporting them in one column is how a maintenance budget argument gets
    lost.
    """
    snapshot = _snapshot(engine, service)
    records = snapshot.ordered
    config = get_apm_config()

    return {
        "assets": [
            {
                "asset_id": record.asset_id,
                "asset_name": record.asset_name,
                "category": record.category,
                "exposure": record.exposure.as_dict(),
                "repair_estimate": record.repair.as_dict(),
                "replacement_cost": record.criticality.replacement_cost,
                "downtime_cost": record.downtime_cost,
                "lifecycle": record.lifecycle.as_dict(),
                "effective_age_days": record.effective_age_days,
                "ageing_factor": record.ageing_factor,
            }
            for record in sorted(records, key=lambda item: -item.exposure.exposure)
        ],
        "economics": snapshot.economics.as_dict(),
        "lifecycle_distribution": snapshot.lifecycle_distribution,
        "model": config.as_dict()["cost"],
        "assumptions": {
            "prevention_effectiveness": cost_model.PREVENTION_EFFECTIVENESS,
            "lead_time_outage_share": cost_model.LEAD_TIME_OUTAGE_SHARE,
            "service_wear_threshold": cost_model.SERVICE_WEAR_THRESHOLD,
            "note": (
                "Maintenance reduces risk, it does not abolish it. Avoidable exposure is "
                f"{cost_model.PREVENTION_EFFECTIVENESS:.0%} of total exposure, and ROI is computed "
                "against planned spend only — reactive spend paid for a failure that had already "
                "happened and did not buy avoidance."
            ),
        },
        "meta": build_meta(engine),
    }


@router.get("/backlog", summary="Outstanding maintenance work")
def read_backlog(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    snapshot = _snapshot(engine, service)
    now = datetime.now(timezone.utc)
    orders = [record for record in _work_order_engine().all() if record.is_open]

    return {
        "backlog": snapshot.backlog.as_dict(),
        "work_orders": [
            record.as_dict(now)
            for record in sorted(orders, key=lambda item: (-item.priority_score, item.raised_at))
        ],
        "capacity": {
            "weekly_labour_hours": get_apm_config().targets.weekly_labour_hours,
            "weeks_of_work": snapshot.backlog.weeks_of_work,
        },
        "meta": build_meta(engine),
    }


@router.get("/effectiveness", summary="Whether the maintenance programme is working")
def read_effectiveness(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    snapshot = _snapshot(engine, service)
    config = get_apm_config()

    return {
        "effectiveness": snapshot.effectiveness.as_dict(),
        "targets": {
            "planned_ratio": config.targets.planned_ratio,
            "schedule_compliance": config.targets.schedule_compliance,
            "mttr_minutes": config.targets.mttr_minutes,
            "rework_rate": config.targets.rework_rate,
        },
        "economics": snapshot.economics.as_dict(),
        "reliability": snapshot.fleet_reliability.as_dict(),
        "meta": build_meta(engine),
    }


@router.get("/hierarchy", response_model=HierarchyResponse, summary="Enterprise to sensor hierarchy")
def read_hierarchy(
    depth: int = Query(default=99, ge=1, le=99),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> HierarchyResponse:
    """The asset hierarchy, with APM's figures folded through every level.

    A read model. The platform's asset record carries six fields and no location,
    so the levels are *projected* from attributes the register already holds rather
    than from columns APM would have had to add to a table three other modules
    read. The shape is the specified one; the derivation is published alongside it
    so nobody mistakes a projection for stored location data.
    """
    from app.services.apm.hierarchy import LEVELS

    snapshot = _snapshot(engine, service)

    return HierarchyResponse(
        root=snapshot.hierarchy.as_dict(depth),
        levels=list(LEVELS),
        derivation={
            "enterprise": "The estate itself",
            "portfolio": "Device class, the unit the platform already rolls up by",
            "site": "Brand, which is how the estate is procured and supported",
            "floor": "Model family",
            "zone": "Computed criticality class, which is how work is actually queued",
            "asset": "The asset register record",
            "sensor": "The MIKOS sensor bound to the asset",
            "note": (
                "Projected from the register, not stored on it. The asset record carries no "
                "location columns and APM does not add them. Consumers are written against the "
                "level names, so real location data can replace the projection without changing them."
            ),
        },
        meta=build_meta(engine),
    )


@router.get("/history", summary="Stored APM history for the trend")
def read_history(
    asset_id: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """Snapshotted APM composites, oldest first.

    Served from storage, so it returns an empty set rather than an error when the
    database is unreachable — a missing trend should not take a working page down.
    """
    try:
        records = repository.read_snapshots(asset_id, days)
        available = True
    except Exception:
        records, available = [], False

    return {
        "records": records,
        "count": len(records),
        "days": days,
        "available": available,
        "meta": build_meta(engine),
    }


@router.get("/assets/{asset_id}", summary="The complete APM record for one asset")
def read_asset(
    asset_id: str,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    snapshot = _snapshot(engine, service)
    record = snapshot.records.get(asset_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id} in the APM register"
        )

    now = datetime.now(timezone.utc)
    orders = _work_order_engine().for_asset(asset_id)

    return {
        "asset": record.as_dict(),
        "work_orders": [entry.as_dict(now) for entry in orders],
        "outcomes": [
            outcome.as_dict()
            for outcome in _work_order_engine().outcomes()
            if outcome.asset_id == asset_id
        ],
        "meta": build_meta(engine),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Work orders
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/work-orders", response_model=WorkOrderListResponse, summary="The work order queue")
def list_work_orders(
    asset_id: str | None = Query(default=None),
    order_status: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None, description="P1, P2, P3 or P4"),
    work_order_type: str | None = Query(default=None, alias="type"),
    origin: str | None = Query(default=None),
    open_only: bool = Query(default=False),
    overdue_only: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=1000),
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderListResponse:
    now = datetime.now(timezone.utc)
    everything = _work_order_engine().all()

    selected = [
        record
        for record in everything
        if (asset_id is None or record.asset_id == asset_id)
        and (order_status is None or record.status == order_status)
        and (priority is None or record.priority_code == priority)
        and (work_order_type is None or record.work_order_type == work_order_type)
        and (origin is None or record.origin == origin)
        and (not open_only or record.is_open)
        and (not overdue_only or record.is_overdue(now))
    ]
    selected.sort(key=lambda record: (-record.priority_score, record.raised_at))

    by_status: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    for record in everything:
        by_status[record.status] = by_status.get(record.status, 0) + 1
        by_priority[record.priority_code] = by_priority.get(record.priority_code, 0) + 1

    return WorkOrderListResponse(
        work_orders=[record.as_dict(now) for record in selected[:limit]],
        total=len(everything),
        returned=min(len(selected), limit),
        backlog=wo.backlog(everything, now).as_dict(),
        effectiveness=wo.effectiveness(everything).as_dict(),
        by_status=by_status,
        by_priority=by_priority,
        meta=build_meta(engine),
    )


@router.post(
    "/work-orders",
    response_model=WorkOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Raise a work order",
)
def raise_work_order(
    payload: WorkOrderCreate,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> WorkOrderResponse:
    """Raise an order against an asset.

    Priority is scored by APM from the asset's own risk, condition and
    criticality rather than accepted from the caller — a requester-chosen priority
    is how every order in a work management system ends up urgent. Where no cost
    estimate is supplied, the asset's own repair estimate stands in, so an order
    always contributes something honest to the backlog cost.
    """
    snapshot = _snapshot(engine, service)
    record = snapshot.records.get(payload.asset_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No asset {payload.asset_id} in the APM register",
        )

    reactive = payload.work_order_type == "Corrective"
    estimated_cost = (
        payload.estimated_cost
        if payload.estimated_cost is not None
        else (record.repair.reactive_total if reactive else record.repair.planned_total)
    )
    estimated_hours = (
        payload.estimated_hours if payload.estimated_hours is not None else record.repair.labour_hours
    )

    order = _transition(
        _work_order_engine().raise_order,
        asset_id=record.asset_id,
        asset_name=record.asset_name,
        category=record.category,
        work_order_type=payload.work_order_type,
        title=payload.title,
        description=payload.description,
        origin=payload.origin,
        component=payload.component or record.repair.primary_component,
        priority=record.priority.label,
        priority_code=record.priority.code,
        priority_score=record.priority.score,
        criticality_code=record.criticality.code,
        risk_score=record.risk.score,
        estimated_cost=estimated_cost,
        estimated_hours=estimated_hours,
        anomaly_uids=payload.anomaly_uids,
        planned=payload.planned if payload.planned is not None else not reactive,
        actor=payload.raised_by,
    )

    # The new order changes the backlog, which feeds priority and economics.
    service.refresh(engine)
    return WorkOrderResponse(work_order=order.as_dict(), meta=build_meta(engine))


@router.post(
    "/work-orders/from-recommendations",
    summary="Raise orders for every asset APM recommends one for",
)
def raise_from_recommendations(
    limit: int = Query(default=10, ge=1, le=100),
    min_priority: str = Query(default="P4", description="Raise only at or above this class"),
    actor: str = Body(default="apm", embed=True),
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> dict:
    """Bulk-raise from the recommendation engine.

    Assets that already have an open order are skipped rather than duplicated:
    raising a second order for work already queued is how a backlog inflates
    without any new work existing.
    """
    snapshot = _snapshot(engine, service)
    engine_orders = _work_order_engine()
    existing = engine_orders.assets_with_open_orders()

    rank = {"P1": 4, "P2": 3, "P3": 2, "P4": 1}
    floor = rank.get(min_priority, 1)

    candidates = [
        record
        for record in snapshot.ordered
        if record.action.raise_work_order
        and record.action.work_order_type is not None
        and record.asset_id not in existing
        and rank.get(record.priority.code, 0) >= floor
    ]
    candidates.sort(key=lambda record: -record.priority.score)

    raised = []
    for record in candidates[:limit]:
        reactive = record.action.work_order_type == "Corrective"
        order = engine_orders.raise_order(
            asset_id=record.asset_id,
            asset_name=record.asset_name,
            category=record.category,
            work_order_type=record.action.work_order_type,
            title=record.action.action,
            description=record.action.rationale,
            origin="recommendation",
            component=record.repair.primary_component,
            priority=record.priority.label,
            priority_code=record.priority.code,
            priority_score=record.priority.score,
            criticality_code=record.criticality.code,
            risk_score=record.risk.score,
            estimated_cost=record.repair.reactive_total if reactive else record.repair.planned_total,
            estimated_hours=record.repair.labour_hours,
            anomaly_uids=[],
            planned=not reactive,
            actor=actor,
        )
        raised.append(order)

    service.refresh(engine)
    now = datetime.now(timezone.utc)

    return {
        "raised": [order.as_dict(now) for order in raised],
        "count": len(raised),
        "candidates": len(candidates),
        "skipped_existing": sum(
            1
            for record in snapshot.ordered
            if record.action.raise_work_order and record.asset_id in existing
        ),
        "meta": build_meta(engine),
    }


@router.get(
    "/work-orders/{work_order_id}", response_model=WorkOrderResponse, summary="One work order"
)
def read_work_order(
    work_order_id: str,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _require_order(work_order_id)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/approve",
    response_model=WorkOrderResponse,
    summary="Approve a raised order",
)
def approve_work_order(
    work_order_id: str,
    payload: ApprovalRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(
        _work_order_engine().approve, work_order_id, payload.approver, payload.note
    )
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/reject",
    response_model=WorkOrderResponse,
    summary="Reject a raised order",
)
def reject_work_order(
    work_order_id: str,
    payload: RejectionRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(
        _work_order_engine().reject, work_order_id, payload.approver, payload.reason
    )
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/assign",
    response_model=WorkOrderResponse,
    summary="Assign, and optionally dispatch",
)
def assign_work_order(
    work_order_id: str,
    payload: AssignRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    engine_orders = _work_order_engine()
    record = _transition(engine_orders.assign, work_order_id, payload.assignee, payload.actor)
    if payload.dispatch:
        record = _transition(
            engine_orders.dispatch, work_order_id, payload.actor, payload.assignee
        )
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/dispatch",
    response_model=WorkOrderResponse,
    summary="Dispatch an assigned order",
)
def dispatch_work_order(
    work_order_id: str,
    payload: ActorRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(_work_order_engine().dispatch, work_order_id, payload.actor)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/start",
    response_model=WorkOrderResponse,
    summary="Start work",
)
def start_work_order(
    work_order_id: str,
    payload: ActorRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(_work_order_engine().start, work_order_id, payload.actor)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/complete",
    response_model=WorkOrderResponse,
    summary="Complete work, pending verification",
)
def complete_work_order(
    work_order_id: str,
    payload: CompletionRequest,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> WorkOrderResponse:
    """Record the work as done. It is not closed — verification comes next.

    The gap between completion and verification is where rework is caught, and
    collapsing the two would make the rework rate unmeasurable.
    """
    record = _transition(
        _work_order_engine().complete,
        work_order_id,
        actor=payload.actor,
        resolution=payload.resolution,
        root_cause=payload.root_cause,
        parts_replaced=payload.parts_replaced,
        findings=payload.findings,
        actual_cost=payload.actual_cost,
        actual_hours=payload.actual_hours,
        downtime_hours=payload.downtime_hours,
    )
    service.refresh(engine)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/verify",
    response_model=WorkOrderResponse,
    summary="Verify completed work, or send it back",
)
def verify_work_order(
    work_order_id: str,
    payload: VerificationRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    engine_orders = _work_order_engine()

    if payload.accepted:
        record = _transition(
            engine_orders.verify, work_order_id, payload.verified_by, payload.findings
        )
    else:
        record = _transition(
            engine_orders.reject_completion,
            work_order_id,
            payload.verified_by,
            payload.reason or "Verification failed",
        )

    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/close",
    response_model=WorkOrderResponse,
    summary="Close a verified order and store its outcome",
)
def close_work_order(
    work_order_id: str,
    payload: ActorRequest,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> WorkOrderResponse:
    """Close the order. Its outcome becomes readable by AD and PdM.

    Closing also acknowledges the AD events the order was raised against, using
    the detector's own public operation — the same one the anomalies endpoint uses.
    APM does not write into AD's state by any other route, and it does not touch
    component wear at all: wear is PdM's, it is monotonic by design, and a module
    that reset it would be rewriting another module's history.
    """
    record = _transition(_work_order_engine().close, work_order_id, payload.actor)

    acknowledged = []
    if record.resolution in wo.CONFIRMING_RESOLUTIONS:
        now = datetime.now(timezone.utc)
        for uid in record.anomaly_uids:
            event = engine.detector.acknowledge(uid, now, by=f"apm:{record.work_order_id}")
            if event is not None:
                acknowledged.append(uid)

    service.refresh(engine)

    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)) | {"acknowledged_anomalies": acknowledged},
        meta=build_meta(engine),
    )


@router.post(
    "/work-orders/{work_order_id}/hold",
    response_model=WorkOrderResponse,
    summary="Put an order on hold",
)
def hold_work_order(
    work_order_id: str,
    payload: HoldRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(_work_order_engine().hold, work_order_id, payload.actor, payload.reason)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/release",
    response_model=WorkOrderResponse,
    summary="Take an order off hold",
)
def release_work_order(
    work_order_id: str,
    payload: ActorRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> WorkOrderResponse:
    record = _transition(_work_order_engine().release, work_order_id, payload.actor)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


@router.post(
    "/work-orders/{work_order_id}/cancel",
    response_model=WorkOrderResponse,
    summary="Cancel an order",
)
def cancel_work_order(
    work_order_id: str,
    payload: HoldRequest,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> WorkOrderResponse:
    record = _transition(_work_order_engine().cancel, work_order_id, payload.actor, payload.reason)
    service.refresh(engine)
    return WorkOrderResponse(
        work_order=record.as_dict(datetime.now(timezone.utc)), meta=build_meta(engine)
    )


# ═══════════════════════════════════════════════════════════════════════════
# Downstream contracts
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/outputs/oee", response_model=OeeInputsResponse, summary="What APM publishes for OEE")
def read_oee_inputs(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> OeeInputsResponse:
    """Availability, health index, maintenance status, downtime and utilisation.

    APM calculates no OEE. There is no performance, quality or effectiveness figure
    in this payload, because those belong to the module downstream and a second
    source for them is what this boundary exists to prevent.
    """
    snapshot = _snapshot(engine, service)
    payload = ApmService.outputs_for_oee(snapshot)
    return OeeInputsResponse(**payload, meta=build_meta(engine))


@router.get(
    "/outputs/executive",
    response_model=ExecutiveOutputsResponse,
    summary="What APM publishes for the executive dashboard",
)
def read_executive_outputs(
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> ExecutiveOutputsResponse:
    snapshot = _snapshot(engine, service)
    payload = ApmService.outputs_for_executive(snapshot)
    return ExecutiveOutputsResponse(**payload, meta=build_meta(engine))


@router.get("/outcomes", response_model=OutcomeResponse, summary="Confirmed outcomes for AD and PdM")
def read_outcomes(
    hours: int = Query(default=168, ge=1, le=8760),
    unpublished_only: bool = Query(default=False),
    engine: InteloraEngine = Depends(get_engine),
) -> OutcomeResponse:
    """Work APM confirmed, for the modules that flagged it.

    A pull feed. AD raised the event and PdM predicted the failure; both are
    entitled to know whether the thing they flagged turned out to be real, and a
    `No-Fault-Found` is as useful to them as a confirmation. APM publishes and the
    owning module decides — nothing here reaches into another module's state.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    engine_orders = _work_order_engine()
    outcomes = engine_orders.outcomes(since)

    unpublished = [
        outcome
        for outcome in outcomes
        if (record := engine_orders.get(outcome.work_order_id)) is not None
        and not record.outcome_published
    ]
    selected = unpublished if unpublished_only else outcomes

    return OutcomeResponse(
        outcomes=[outcome.as_dict() for outcome in selected],
        total=len(outcomes),
        unpublished=len(unpublished),
        meta=build_meta(engine),
    )


@router.post("/outcomes/acknowledge", summary="Mark outcomes as consumed")
def acknowledge_outcomes(
    work_order_ids: list[str] = Body(embed=True),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """Let a consumer record which outcomes it has taken, so it can poll for new ones."""
    marked = _work_order_engine().mark_published(work_order_ids)
    return {"acknowledged": marked, "requested": len(work_order_ids), "meta": build_meta(engine)}


# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/config", response_model=ApmConfigResponse, summary="The APM configuration")
def read_config(engine: InteloraEngine = Depends(get_engine)) -> ApmConfigResponse:
    return ApmConfigResponse(
        config=get_apm_config().as_dict(), recomputed=False, meta=build_meta(engine)
    )


@router.put("/config", response_model=ApmConfigResponse, summary="Adjust the APM configuration")
def update_config(
    payload: ApmConfigUpdate,
    engine: InteloraEngine = Depends(get_engine),
    service: ApmService = Depends(get_apm_service),
) -> ApmConfigResponse:
    """Change the criticality weighting, health index weighting, targets or cost model.

    Weights are renormalised, so a caller may send any subset and the balance
    between factors changes without the scale of the score moving. The estate is
    recomputed immediately, because a weighting change that only takes effect on
    the next analytics tick would let a user read a score under weights they have
    already replaced.
    """
    config = get_apm_config()
    changed = False

    if payload.criticality_weights is not None:
        supplied = payload.criticality_weights.supplied()
        if supplied:
            config.set_criticality_weights(supplied)
            changed = True

    if payload.health_index_weights is not None:
        supplied = payload.health_index_weights.supplied()
        if supplied:
            config.set_health_index_weights(supplied)
            changed = True

    if payload.targets is not None:
        supplied = payload.targets.supplied()
        if supplied:
            config.set_targets(supplied)
            changed = True

    if payload.cost is not None:
        supplied = payload.cost.supplied()
        if supplied:
            config.set_cost_model(supplied)
            changed = True

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recognised configuration values were supplied",
        )

    service.refresh(engine)
    return ApmConfigResponse(config=config.as_dict(), recomputed=True, meta=build_meta(engine))
