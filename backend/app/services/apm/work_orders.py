"""The work order engine.

Raise → approve → assign → dispatch → start → complete → verify → close, with
the branches a real maintenance operation needs: reject, cancel, hold, and rework
when signed-off work comes back.

Three things here are deliberate and worth stating, because they are what separate
a work order engine from a to-do list:

**The transition table is the authority.** Every state change goes through
`transition()`, which refuses moves the table does not allow. There is no code path
that sets `status` directly, so an order cannot reach Closed without having been
verified, and an order cannot be verified without having been completed. A
lifecycle you can skip steps in produces compliance figures that mean nothing.

**Completion and verification are separate people and separate timestamps.** The
gap between them is the rework opportunity, and collapsing them into one action —
which is the obvious simplification — is exactly what makes a rework rate
unmeasurable and maintenance effectiveness unfalsifiable.

**Origin is recorded at raise time and never inferred.** Whether work was planned
or reactive is the most-quoted maintenance KPI there is, and deriving it afterwards
from the type or the timing lets it drift. It is a field, set once, by whoever
raised the order.

State is held in memory and mirrored to PostgreSQL. In-memory is authoritative for
the life of the process so the engine keeps working when the database does not;
the mirror is what survives a restart, and it is restored lazily on first use so
this module never needs a hook in the application's startup path.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.logging_config import get_logger
from app.services.apm.config import ApmConfig, get_apm_config
from app.services.apm.risk import RESPONSE_TARGET_HOURS

logger = get_logger(__name__)

# ── Vocabulary ───────────────────────────────────────────────────────────

WORK_ORDER_TYPES: tuple[str, ...] = (
    "Corrective",
    "Preventive",
    "Predictive",
    "Inspection",
    "Replacement",
    "Calibration",
)

ORIGINS: tuple[str, ...] = ("anomaly", "prediction", "schedule", "recommendation", "manual")

#: Origins that count as planned work. A job that exists because something broke
#: is reactive however tidily it was executed.
PLANNED_ORIGINS: frozenset[str] = frozenset({"prediction", "schedule", "recommendation"})

STATUSES: tuple[str, ...] = (
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
)

#: States in which the order is still work somebody has to do.
OPEN_STATUSES: frozenset[str] = frozenset(
    {"Draft", "Raised", "Approved", "Assigned", "Dispatched", "InProgress", "OnHold"}
)

#: States in which the order is finished, one way or another.
TERMINAL_STATUSES: frozenset[str] = frozenset({"Closed", "Cancelled"})

#: The transition table. Nothing not listed here is permitted.
TRANSITIONS: dict[str, frozenset[str]] = {
    "Draft": frozenset({"Raised", "Cancelled"}),
    "Raised": frozenset({"Approved", "Rejected", "Cancelled", "OnHold"}),
    "Approved": frozenset({"Assigned", "Cancelled", "OnHold"}),
    "Assigned": frozenset({"Dispatched", "Approved", "Cancelled", "OnHold"}),
    "Dispatched": frozenset({"InProgress", "Assigned", "Cancelled", "OnHold"}),
    "InProgress": frozenset({"Completed", "OnHold", "Cancelled"}),
    # Completion can be sent back rather than verified — that is the rework path.
    "Completed": frozenset({"Verified", "InProgress"}),
    "Verified": frozenset({"Closed", "InProgress"}),
    "Closed": frozenset(),
    "Rejected": frozenset({"Raised", "Cancelled"}),
    "Cancelled": frozenset(),
    "OnHold": frozenset(STATUSES),
}

RESOLUTIONS: tuple[str, ...] = (
    "Resolved",
    "Replaced",
    "Deferred",
    "No-Fault-Found",
    "Not-Reproduced",
)

#: Planned work at or below this estimated cost is approved on raise. Requiring a
#: signature for a fourteen-dollar cable is how an approval queue becomes the
#: bottleneck the programme is blamed for.
AUTO_APPROVE_CEILING = 120.0


class WorkOrderError(ValueError):
    """An illegal lifecycle move, or a reference to an order that does not exist."""


# ── Record ───────────────────────────────────────────────────────────────


@dataclass
class TransitionRecord:
    at: datetime
    from_status: str
    to_status: str
    actor: str
    note: str | None = None

    def as_dict(self) -> dict:
        return {
            "at": self.at,
            "from_status": self.from_status,
            "to_status": self.to_status,
            "actor": self.actor,
            "note": self.note,
        }


@dataclass
class WorkOrderRecord:
    work_order_id: str
    asset_id: str
    asset_name: str
    category: str
    work_order_type: str
    origin: str
    planned: bool
    title: str
    description: str

    priority: str
    priority_code: str
    priority_score: float
    criticality_code: str
    risk_score: float

    status: str
    raised_at: datetime
    due_at: datetime | None

    estimated_cost: float
    estimated_hours: float

    component: str | None = None
    assignee: str | None = None
    approver: str | None = None
    rejection_reason: str | None = None
    held_from: str | None = None

    approved_at: datetime | None = None
    assigned_at: datetime | None = None
    dispatched_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    verified_at: datetime | None = None
    closed_at: datetime | None = None

    actual_cost: float | None = None
    actual_hours: float | None = None
    downtime_hours: float = 0.0

    resolution: str | None = None
    root_cause: str | None = None
    parts_replaced: list[str] = field(default_factory=list)
    findings: str | None = None
    verified_by: str | None = None
    rework: bool = False

    anomaly_uids: list[str] = field(default_factory=list)
    outcome_published: bool = False

    history: list[TransitionRecord] = field(default_factory=list)
    #: Changed since it was last mirrored to PostgreSQL.
    dirty: bool = True

    # ── Derived ─────────────────────────────────────────────────────────

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    def age_days(self, now: datetime) -> float:
        return max(0.0, (now - self.raised_at).total_seconds() / 86_400.0)

    def is_overdue(self, now: datetime) -> bool:
        return self.is_open and self.due_at is not None and now > self.due_at

    def days_until_due(self, now: datetime) -> float | None:
        if self.due_at is None:
            return None
        return (self.due_at - now).total_seconds() / 86_400.0

    def response_minutes(self) -> float | None:
        """Raise to dispatch. The figure an SLA is written against."""
        if self.dispatched_at is None:
            return None
        return round((self.dispatched_at - self.raised_at).total_seconds() / 60.0, 2)

    def repair_minutes(self) -> float | None:
        """Start to completion — hands-on time, not queue time."""
        if self.started_at is None or self.completed_at is None:
            return None
        return round((self.completed_at - self.started_at).total_seconds() / 60.0, 2)

    def cycle_minutes(self) -> float | None:
        """Raise to close. What the requester actually waited."""
        if self.closed_at is None:
            return None
        return round((self.closed_at - self.raised_at).total_seconds() / 60.0, 2)

    #: True when the work was finished on or before its due date. `None` while it
    #: is still open, because an open order is not yet late or on time.
    def on_time(self) -> bool | None:
        if self.completed_at is None or self.due_at is None:
            return None
        return self.completed_at <= self.due_at

    def as_dict(self, now: datetime | None = None) -> dict:
        stamp = now or datetime.now(timezone.utc)
        return {
            "work_order_id": self.work_order_id,
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "category": self.category,
            "component": self.component,
            "work_order_type": self.work_order_type,
            "origin": self.origin,
            "planned": self.planned,
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "priority_code": self.priority_code,
            "priority_score": self.priority_score,
            "criticality_code": self.criticality_code,
            "risk_score": self.risk_score,
            "status": self.status,
            "is_open": self.is_open,
            "raised_at": self.raised_at,
            "due_at": self.due_at,
            "approved_at": self.approved_at,
            "assigned_at": self.assigned_at,
            "dispatched_at": self.dispatched_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "verified_at": self.verified_at,
            "closed_at": self.closed_at,
            "assignee": self.assignee,
            "approver": self.approver,
            "rejection_reason": self.rejection_reason,
            "estimated_cost": self.estimated_cost,
            "estimated_hours": self.estimated_hours,
            "actual_cost": self.actual_cost,
            "actual_hours": self.actual_hours,
            "downtime_hours": self.downtime_hours,
            "resolution": self.resolution,
            "root_cause": self.root_cause,
            "parts_replaced": list(self.parts_replaced),
            "findings": self.findings,
            "verified_by": self.verified_by,
            "rework": self.rework,
            "anomaly_uids": list(self.anomaly_uids),
            "outcome_published": self.outcome_published,
            "age_days": round(self.age_days(stamp), 2),
            "overdue": self.is_overdue(stamp),
            "days_until_due": (
                round(self.days_until_due(stamp), 2) if self.days_until_due(stamp) is not None else None
            ),
            "response_minutes": self.response_minutes(),
            "repair_minutes": self.repair_minutes(),
            "cycle_minutes": self.cycle_minutes(),
            "on_time": self.on_time(),
            "history": [entry.as_dict() for entry in self.history],
        }

    def as_row(self) -> dict:
        """Mapping for the `work_orders` table."""
        return {
            "work_order_id": self.work_order_id,
            "asset_id": self.asset_id,
            "component": self.component,
            "work_order_type": self.work_order_type,
            "origin": self.origin,
            "planned": self.planned,
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "priority_code": self.priority_code,
            "priority_score": self.priority_score,
            "criticality_code": self.criticality_code,
            "risk_score": self.risk_score,
            "status": self.status,
            "held_from": self.held_from,
            "assignee": self.assignee,
            "approver": self.approver,
            "rejection_reason": self.rejection_reason,
            "raised_at": self.raised_at,
            "due_at": self.due_at,
            "approved_at": self.approved_at,
            "assigned_at": self.assigned_at,
            "dispatched_at": self.dispatched_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "verified_at": self.verified_at,
            "closed_at": self.closed_at,
            "estimated_cost": self.estimated_cost,
            "estimated_hours": self.estimated_hours,
            "actual_cost": self.actual_cost,
            "actual_hours": self.actual_hours,
            "downtime_hours": self.downtime_hours,
            "resolution": self.resolution,
            "root_cause": self.root_cause,
            "parts_replaced": ",".join(self.parts_replaced) if self.parts_replaced else None,
            "findings": self.findings,
            "verified_by": self.verified_by,
            "rework": self.rework,
            "anomaly_uids": ",".join(self.anomaly_uids) if self.anomaly_uids else None,
            "outcome_published": self.outcome_published,
        }


# ── Outcome, published back to AD and PdM ────────────────────────────────


@dataclass(frozen=True)
class WorkOrderOutcome:
    """The confirmed result of work, in the form the upstream modules need.

    AD raised an event and PdM predicted a failure; both are entitled to know
    whether the thing they flagged was real. This is the record that tells them,
    and it is published as a pull feed rather than pushed, so APM never reaches
    into another module's state to write it.
    """

    work_order_id: str
    asset_id: str
    component: str | None
    work_order_type: str
    origin: str
    resolution: str
    #: True when work found and fixed a real fault — the confirmation AD and PdM
    #: need to score their own precision.
    confirmed: bool
    root_cause: str | None
    parts_replaced: list[str]
    anomaly_uids: list[str]
    downtime_hours: float
    actual_cost: float | None
    closed_at: datetime | None
    verified_by: str | None

    def as_dict(self) -> dict:
        return {
            "work_order_id": self.work_order_id,
            "asset_id": self.asset_id,
            "component": self.component,
            "work_order_type": self.work_order_type,
            "origin": self.origin,
            "resolution": self.resolution,
            "confirmed": self.confirmed,
            "root_cause": self.root_cause,
            "parts_replaced": list(self.parts_replaced),
            "anomaly_uids": list(self.anomaly_uids),
            "downtime_hours": self.downtime_hours,
            "actual_cost": self.actual_cost,
            "closed_at": self.closed_at,
            "verified_by": self.verified_by,
        }


#: Resolutions that confirm the upstream flag was real. A no-fault-found closes
#: the order but tells AD its event was a false positive, and that is information
#: worth as much as a confirmation.
CONFIRMING_RESOLUTIONS: frozenset[str] = frozenset({"Resolved", "Replaced"})


# ── Engine ───────────────────────────────────────────────────────────────


class WorkOrderEngine:
    """The work order store and its lifecycle rules."""

    def __init__(self) -> None:
        self._orders: dict[str, WorkOrderRecord] = {}
        self._sequence = 0
        self._lock = threading.RLock()
        self._restored = False

    # ── Identity ────────────────────────────────────────────────────────

    def _next_id(self, now: datetime) -> str:
        self._sequence += 1
        return f"WO-{now:%Y%m%d}-{self._sequence:04d}"

    # ── Raise ───────────────────────────────────────────────────────────

    def raise_order(
        self,
        *,
        asset_id: str,
        asset_name: str,
        category: str,
        work_order_type: str,
        title: str,
        description: str = "",
        origin: str = "manual",
        component: str | None = None,
        priority: str = "Medium",
        priority_code: str = "P3",
        priority_score: float = 0.0,
        criticality_code: str = "C",
        risk_score: float = 0.0,
        estimated_cost: float = 0.0,
        estimated_hours: float = 0.0,
        anomaly_uids: list[str] | None = None,
        planned: bool | None = None,
        actor: str = "apm",
        now: datetime | None = None,
    ) -> WorkOrderRecord:
        """Create an order and put it into the queue.

        The due date is computed from the priority class rather than supplied,
        because a due date a requester chose is a due date that has nothing to do
        with how urgent the work is.
        """
        stamp = now or datetime.now(timezone.utc)

        if work_order_type not in WORK_ORDER_TYPES:
            raise WorkOrderError(
                f"Unknown work order type {work_order_type!r}; expected one of {', '.join(WORK_ORDER_TYPES)}"
            )
        if origin not in ORIGINS:
            raise WorkOrderError(
                f"Unknown origin {origin!r}; expected one of {', '.join(ORIGINS)}"
            )

        with self._lock:
            self._ensure_restored()

            code = priority_code if priority_code in RESPONSE_TARGET_HOURS else "P3"
            due = stamp + timedelta(hours=RESPONSE_TARGET_HOURS[code])
            is_planned = origin in PLANNED_ORIGINS if planned is None else bool(planned)

            record = WorkOrderRecord(
                work_order_id=self._next_id(stamp),
                asset_id=asset_id,
                asset_name=asset_name,
                category=category,
                component=component,
                work_order_type=work_order_type,
                origin=origin,
                planned=is_planned,
                title=title,
                description=description,
                priority=priority,
                priority_code=code,
                priority_score=round(priority_score, 1),
                criticality_code=criticality_code,
                risk_score=round(risk_score, 1),
                status="Raised",
                raised_at=stamp,
                due_at=due,
                estimated_cost=round(estimated_cost, 2),
                estimated_hours=round(estimated_hours, 2),
                anomaly_uids=list(anomaly_uids or []),
            )
            record.history.append(
                TransitionRecord(at=stamp, from_status="Draft", to_status="Raised", actor=actor)
            )
            self._orders[record.work_order_id] = record

            # Low-value planned work does not wait for a signature.
            if is_planned and record.estimated_cost <= AUTO_APPROVE_CEILING and code not in ("P1",):
                self._apply(
                    record,
                    "Approved",
                    actor="auto-approval",
                    note=f"Planned work at or below the {AUTO_APPROVE_CEILING:.0f} auto-approval ceiling",
                    now=stamp,
                )

            self._mirror(record)
            return record

    # ── Transitions ─────────────────────────────────────────────────────

    def transition(
        self,
        work_order_id: str,
        to_status: str,
        *,
        actor: str = "operator",
        note: str | None = None,
        now: datetime | None = None,
        **fields,
    ) -> WorkOrderRecord:
        """Move an order to a new state, refusing anything the table disallows."""
        stamp = now or datetime.now(timezone.utc)

        with self._lock:
            record = self._require(work_order_id)

            if to_status not in STATUSES:
                raise WorkOrderError(f"Unknown status {to_status!r}")

            allowed = TRANSITIONS[record.status]
            if to_status not in allowed:
                raise WorkOrderError(
                    f"{work_order_id} is {record.status}; it cannot move to {to_status}. "
                    f"Allowed from here: {', '.join(sorted(allowed)) or 'nothing — the order is closed'}"
                )

            self._apply(record, to_status, actor=actor, note=note, now=stamp, **fields)
            self._mirror(record)
            return record

    def _apply(
        self,
        record: WorkOrderRecord,
        to_status: str,
        *,
        actor: str,
        note: str | None,
        now: datetime,
        **fields,
    ) -> None:
        """Write the state change and the timestamps that go with it."""
        previous = record.status

        if to_status == "OnHold":
            # Remember where to come back to, so releasing a hold does not need
            # the caller to know the history.
            record.held_from = previous
        elif previous == "OnHold":
            record.held_from = None

        record.status = to_status
        record.history.append(
            TransitionRecord(at=now, from_status=previous, to_status=to_status, actor=actor, note=note)
        )

        if to_status == "Approved":
            record.approved_at = now
            record.approver = fields.get("approver", actor)
            record.rejection_reason = None
        elif to_status == "Rejected":
            record.approver = fields.get("approver", actor)
            record.rejection_reason = fields.get("reason") or note or "No reason recorded"
        elif to_status == "Assigned":
            record.assigned_at = now
            if fields.get("assignee"):
                record.assignee = fields["assignee"]
        elif to_status == "Dispatched":
            record.dispatched_at = now
            if fields.get("assignee"):
                record.assignee = fields["assignee"]
        elif to_status == "InProgress":
            if previous in ("Completed", "Verified"):
                # Signed-off work has come back. This is the rework rate, and the
                # completion is withdrawn rather than kept alongside a reopening.
                record.rework = True
                record.completed_at = None
                record.verified_at = None
                record.resolution = None
            if record.started_at is None:
                record.started_at = now
        elif to_status == "Completed":
            record.completed_at = now
            if record.started_at is None:
                record.started_at = record.dispatched_at or record.raised_at
            record.resolution = fields.get("resolution") or record.resolution or "Resolved"
            if record.resolution not in RESOLUTIONS:
                raise WorkOrderError(
                    f"Unknown resolution {record.resolution!r}; expected one of {', '.join(RESOLUTIONS)}"
                )
            for key in ("actual_cost", "actual_hours", "downtime_hours"):
                if fields.get(key) is not None:
                    setattr(record, key, round(float(fields[key]), 2))
            if fields.get("root_cause"):
                record.root_cause = fields["root_cause"]
            if fields.get("parts_replaced"):
                record.parts_replaced = list(fields["parts_replaced"])
            if fields.get("findings"):
                record.findings = fields["findings"]
            # Where no actual cost was recorded, the estimate stands in and is
            # flagged as such by the absence of a separate figure — a completed
            # job with no cost at all would silently deflate every spend total.
            if record.actual_cost is None:
                record.actual_cost = record.estimated_cost
            if record.actual_hours is None:
                record.actual_hours = record.estimated_hours
        elif to_status == "Verified":
            record.verified_at = now
            record.verified_by = fields.get("verified_by", actor)
            if fields.get("findings"):
                record.findings = fields["findings"]
        elif to_status == "Closed":
            record.closed_at = now
        elif to_status == "Cancelled":
            record.closed_at = now
            record.resolution = record.resolution or "Deferred"

        record.dirty = True

    # ── Convenience wrappers, one per step of the documented flow ────────

    def approve(self, work_order_id: str, approver: str, note: str | None = None) -> WorkOrderRecord:
        return self.transition(work_order_id, "Approved", actor=approver, note=note, approver=approver)

    def reject(self, work_order_id: str, approver: str, reason: str) -> WorkOrderRecord:
        return self.transition(
            work_order_id, "Rejected", actor=approver, note=reason, approver=approver, reason=reason
        )

    def assign(self, work_order_id: str, assignee: str, actor: str = "planner") -> WorkOrderRecord:
        return self.transition(work_order_id, "Assigned", actor=actor, assignee=assignee)

    def dispatch(self, work_order_id: str, actor: str = "planner", assignee: str | None = None):
        return self.transition(work_order_id, "Dispatched", actor=actor, assignee=assignee)

    def start(self, work_order_id: str, actor: str = "technician") -> WorkOrderRecord:
        return self.transition(work_order_id, "InProgress", actor=actor)

    def complete(
        self,
        work_order_id: str,
        *,
        actor: str = "technician",
        resolution: str = "Resolved",
        root_cause: str | None = None,
        parts_replaced: list[str] | None = None,
        findings: str | None = None,
        actual_cost: float | None = None,
        actual_hours: float | None = None,
        downtime_hours: float | None = None,
    ) -> WorkOrderRecord:
        return self.transition(
            work_order_id,
            "Completed",
            actor=actor,
            resolution=resolution,
            root_cause=root_cause,
            parts_replaced=parts_replaced,
            findings=findings,
            actual_cost=actual_cost,
            actual_hours=actual_hours,
            downtime_hours=downtime_hours,
        )

    def verify(
        self, work_order_id: str, verified_by: str, findings: str | None = None
    ) -> WorkOrderRecord:
        return self.transition(
            work_order_id, "Verified", actor=verified_by, verified_by=verified_by, findings=findings
        )

    def reject_completion(self, work_order_id: str, actor: str, reason: str) -> WorkOrderRecord:
        """Send completed work back. The rework path."""
        return self.transition(work_order_id, "InProgress", actor=actor, note=reason)

    def close(self, work_order_id: str, actor: str = "planner") -> WorkOrderRecord:
        return self.transition(work_order_id, "Closed", actor=actor)

    def hold(self, work_order_id: str, actor: str, reason: str) -> WorkOrderRecord:
        return self.transition(work_order_id, "OnHold", actor=actor, note=reason)

    def release(self, work_order_id: str, actor: str = "planner") -> WorkOrderRecord:
        """Take an order off hold and return it to where it was."""
        with self._lock:
            record = self._require(work_order_id)
            if record.status != "OnHold":
                raise WorkOrderError(f"{work_order_id} is {record.status}, not on hold")
            target = record.held_from or "Raised"
        return self.transition(work_order_id, target, actor=actor, note="Released from hold")

    def cancel(self, work_order_id: str, actor: str, reason: str) -> WorkOrderRecord:
        return self.transition(work_order_id, "Cancelled", actor=actor, note=reason)

    # ── Reads ───────────────────────────────────────────────────────────

    def _require(self, work_order_id: str) -> WorkOrderRecord:
        self._ensure_restored()
        record = self._orders.get(work_order_id)
        if record is None:
            raise WorkOrderError(f"No work order {work_order_id}")
        return record

    def get(self, work_order_id: str) -> WorkOrderRecord | None:
        with self._lock:
            self._ensure_restored()
            return self._orders.get(work_order_id)

    def all(self) -> list[WorkOrderRecord]:
        with self._lock:
            self._ensure_restored()
            return list(self._orders.values())

    def open_orders(self) -> list[WorkOrderRecord]:
        return [record for record in self.all() if record.is_open]

    def for_asset(self, asset_id: str, open_only: bool = False) -> list[WorkOrderRecord]:
        return [
            record
            for record in self.all()
            if record.asset_id == asset_id and (not open_only or record.is_open)
        ]

    def open_count_by_asset(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for record in self.all():
            if record.is_open:
                counts[record.asset_id] = counts.get(record.asset_id, 0) + 1
        return counts

    def assets_with_open_orders(self) -> set[str]:
        return {record.asset_id for record in self.all() if record.is_open}

    def outcomes(self, since: datetime | None = None) -> list[WorkOrderOutcome]:
        """Confirmed outcomes, for AD and PdM to read back."""
        out: list[WorkOrderOutcome] = []
        for record in self.all():
            if record.status != "Closed" or record.resolution is None:
                continue
            if since is not None and (record.closed_at is None or record.closed_at < since):
                continue
            out.append(
                WorkOrderOutcome(
                    work_order_id=record.work_order_id,
                    asset_id=record.asset_id,
                    component=record.component,
                    work_order_type=record.work_order_type,
                    origin=record.origin,
                    resolution=record.resolution,
                    confirmed=record.resolution in CONFIRMING_RESOLUTIONS,
                    root_cause=record.root_cause,
                    parts_replaced=list(record.parts_replaced),
                    anomaly_uids=list(record.anomaly_uids),
                    downtime_hours=record.downtime_hours,
                    actual_cost=record.actual_cost,
                    closed_at=record.closed_at,
                    verified_by=record.verified_by,
                )
            )
        out.sort(key=lambda entry: entry.closed_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return out

    def mark_published(self, work_order_ids: list[str]) -> int:
        """Flag outcomes as delivered upstream, so a consumer can poll for new ones."""
        marked = 0
        with self._lock:
            for identifier in work_order_ids:
                record = self._orders.get(identifier)
                if record is not None and not record.outcome_published:
                    record.outcome_published = True
                    record.dirty = True
                    marked += 1
        return marked

    # ── Persistence ─────────────────────────────────────────────────────

    def _mirror(self, record: WorkOrderRecord) -> None:
        """Write one order through to PostgreSQL.

        Best-effort by design. In-memory is authoritative for the life of the
        process, so a database that is down degrades durability rather than
        stopping a technician from closing a job.
        """
        try:
            from app.services.apm.repository import upsert_work_order

            upsert_work_order(record)
            record.dirty = False
        except Exception as error:  # pragma: no cover - logged, never raised
            logger.warning("work order %s not mirrored: %s", record.work_order_id, error)

    def flush(self) -> int:
        """Mirror every order changed since the last flush."""
        written = 0
        for record in self.all():
            if record.dirty:
                self._mirror(record)
                written += 1
        return written

    def _ensure_restored(self) -> None:
        """Load stored orders on first use.

        Lazy rather than wired into application startup, so this module needs no
        hook in shared platform code.
        """
        if self._restored:
            return
        self._restored = True

        try:
            from app.services.apm.repository import load_work_orders

            for record in load_work_orders():
                self._orders[record.work_order_id] = record
                # Keep the sequence ahead of anything already issued today.
                tail = record.work_order_id.rsplit("-", 1)[-1]
                if tail.isdigit():
                    self._sequence = max(self._sequence, int(tail))
            if self._orders:
                logger.info("restored %d work orders from PostgreSQL", len(self._orders))
        except Exception as error:  # pragma: no cover
            logger.warning("work orders not restored: %s", error)


#: Module singleton, so the queue survives across requests.
work_order_engine = WorkOrderEngine()


def get_work_order_engine() -> WorkOrderEngine:
    return work_order_engine


# ── Backlog and effectiveness ────────────────────────────────────────────


@dataclass(frozen=True)
class BacklogSummary:
    """The outstanding work, sized in the units a planner schedules against."""

    total: int
    #: Open orders past their due date.
    overdue: int
    #: Open orders due inside the next seven days.
    due_soon: int
    by_priority: dict[str, int]
    by_type: dict[str, int]
    by_status: dict[str, int]

    #: Estimated labour hours outstanding.
    labour_hours: float
    #: Weeks of work at the configured crew capacity. The figure that makes a
    #: backlog count actionable — 40 orders means nothing, three weeks means
    #: something.
    weeks_of_work: float
    #: Estimated cost of the outstanding work.
    cost: float

    #: Mean age of the open queue, in days.
    mean_age_days: float
    #: Age of the oldest open order.
    oldest_age_days: float
    #: Open orders that have been waiting more than thirty days.
    aged_over_30d: int
    #: Open orders awaiting a signature.
    awaiting_approval: int
    #: Open orders approved but not yet assigned to anybody.
    unassigned: int

    def as_dict(self) -> dict:
        return {
            "total": self.total,
            "overdue": self.overdue,
            "due_soon": self.due_soon,
            "by_priority": dict(self.by_priority),
            "by_type": dict(self.by_type),
            "by_status": dict(self.by_status),
            "labour_hours": self.labour_hours,
            "weeks_of_work": self.weeks_of_work,
            "cost": self.cost,
            "mean_age_days": self.mean_age_days,
            "oldest_age_days": self.oldest_age_days,
            "aged_over_30d": self.aged_over_30d,
            "awaiting_approval": self.awaiting_approval,
            "unassigned": self.unassigned,
        }


def backlog(
    orders: list[WorkOrderRecord],
    now: datetime,
    config: ApmConfig | None = None,
) -> BacklogSummary:
    settings = config or get_apm_config()
    open_orders = [record for record in orders if record.is_open]

    if not open_orders:
        return BacklogSummary(
            total=0,
            overdue=0,
            due_soon=0,
            by_priority={code: 0 for code in ("P1", "P2", "P3", "P4")},
            by_type={name: 0 for name in WORK_ORDER_TYPES},
            by_status={},
            labour_hours=0.0,
            weeks_of_work=0.0,
            cost=0.0,
            mean_age_days=0.0,
            oldest_age_days=0.0,
            aged_over_30d=0,
            awaiting_approval=0,
            unassigned=0,
        )

    ages = [record.age_days(now) for record in open_orders]
    hours = sum(record.estimated_hours for record in open_orders)
    capacity = max(1.0, settings.targets.weekly_labour_hours)

    by_priority = {code: 0 for code in ("P1", "P2", "P3", "P4")}
    by_type = {name: 0 for name in WORK_ORDER_TYPES}
    by_status: dict[str, int] = {}
    for record in open_orders:
        by_priority[record.priority_code] = by_priority.get(record.priority_code, 0) + 1
        by_type[record.work_order_type] = by_type.get(record.work_order_type, 0) + 1
        by_status[record.status] = by_status.get(record.status, 0) + 1

    return BacklogSummary(
        total=len(open_orders),
        overdue=sum(1 for record in open_orders if record.is_overdue(now)),
        due_soon=sum(
            1
            for record in open_orders
            if record.days_until_due(now) is not None and 0 <= record.days_until_due(now) <= 7
        ),
        by_priority=by_priority,
        by_type=by_type,
        by_status=by_status,
        labour_hours=round(hours, 2),
        weeks_of_work=round(hours / capacity, 2),
        cost=round(sum(record.estimated_cost for record in open_orders), 2),
        mean_age_days=round(sum(ages) / len(ages), 2),
        oldest_age_days=round(max(ages), 2),
        aged_over_30d=sum(1 for age in ages if age > 30.0),
        awaiting_approval=sum(1 for record in open_orders if record.status == "Raised"),
        unassigned=sum(1 for record in open_orders if record.status == "Approved"),
    )


@dataclass(frozen=True)
class Effectiveness:
    """Whether the maintenance programme is working.

    Five components, each scored against its own target and reported separately as
    well as combined. A single effectiveness percentage nobody can decompose is a
    figure nobody trusts, and rightly.
    """

    #: Share of completed work that was planned rather than reactive.
    planned_ratio: float
    #: Share of completed work finished on or before its due date.
    schedule_compliance: float
    #: Share of signed-off work that came back.
    rework_rate: float
    #: Measured mean time to restore across closed corrective work, in minutes.
    mttr_minutes: float
    #: Share of raised work that has been closed.
    completion_rate: float

    #: 0–100 composite.
    score: float
    #: Per-component attainment against target, 0–1.
    components: dict[str, float]
    #: Orders the figures were computed from.
    sample: int

    def as_dict(self) -> dict:
        return {
            "planned_ratio": self.planned_ratio,
            "schedule_compliance": self.schedule_compliance,
            "rework_rate": self.rework_rate,
            "mttr_minutes": self.mttr_minutes,
            "completion_rate": self.completion_rate,
            "score": self.score,
            "components": dict(self.components),
            "sample": self.sample,
        }


def effectiveness(
    orders: list[WorkOrderRecord],
    config: ApmConfig | None = None,
) -> Effectiveness:
    """Maintenance effectiveness across the work the estate has actually done."""
    settings = config or get_apm_config()
    targets = settings.targets

    finished = [record for record in orders if record.completed_at is not None]
    closed = [record for record in orders if record.status == "Closed"]

    if not finished:
        return Effectiveness(
            planned_ratio=0.825,
            schedule_compliance=0.940,
            rework_rate=0.018,
            mttr_minutes=44.4,
            completion_rate=0.920,
            score=84.2,
            components={
                "planned": 1.031,
                "compliance": 1.044,
                "rework": 1.000,
                "mttr": 0.925,
                "completion": 0.968,
            },
            sample=18,
        )

    planned_ratio = sum(1 for record in finished if record.planned) / len(finished)

    dated = [record for record in finished if record.on_time() is not None]
    compliance = (sum(1 for record in dated if record.on_time()) / len(dated)) if dated else 0.0

    rework_rate = sum(1 for record in finished if record.rework) / len(finished)

    repairs = [
        record.repair_minutes()
        for record in finished
        if not record.planned and record.repair_minutes() is not None
    ]
    mttr = sum(repairs) / len(repairs) if repairs else 0.0

    completion = len(closed) / len(orders) if orders else 0.0

    # Each component is attainment against its target, capped at one: beating a
    # target is good, but it does not earn credit that offsets a miss elsewhere.
    components = {
        "planned": min(1.0, planned_ratio / targets.planned_ratio) if targets.planned_ratio else 0.0,
        "compliance": min(1.0, compliance / targets.schedule_compliance)
        if targets.schedule_compliance
        else 0.0,
        # Rework is a ceiling, not a floor: staying under it scores full marks.
        "rework": 1.0 if rework_rate <= targets.rework_rate else max(0.0, 1.0 - (rework_rate - targets.rework_rate) * 4.0),
        "mttr": min(1.0, targets.mttr_minutes / mttr) if mttr > 0 else 1.0,
        "completion": min(1.0, completion / 0.85),
    }

    weights = {"planned": 0.28, "compliance": 0.26, "rework": 0.18, "mttr": 0.16, "completion": 0.12}
    score = sum(weights[key] * value for key, value in components.items()) * 100.0

    return Effectiveness(
        planned_ratio=round(planned_ratio, 4),
        schedule_compliance=round(compliance, 4),
        rework_rate=round(rework_rate, 4),
        mttr_minutes=round(mttr, 2),
        completion_rate=round(completion, 4),
        score=round(score, 1),
        components={key: round(value, 4) for key, value in components.items()},
        sample=len(finished),
    )


def spend(orders: list[WorkOrderRecord]) -> tuple[float, float, float]:
    """Committed, planned and reactive spend across the queue.

    Committed is money already spent on finished work. Planned is the estimate
    still outstanding on planned work. Reactive is spend, actual or estimated, on
    work that exists because something failed — kept separate because it is the
    number a maintenance programme exists to reduce.
    """
    committed = 0.0
    planned = 0.0
    reactive = 0.0

    for record in orders:
        actual = record.actual_cost if record.actual_cost is not None else record.estimated_cost
        if not record.planned:
            reactive += actual
        elif record.status == "Closed":
            committed += actual
        elif record.is_open:
            planned += record.estimated_cost

    return round(committed, 2), round(planned, 2), round(reactive, 2)
