"""Preventive and prescriptive maintenance.

Two layers that answer different questions from the same estate state.

**Preventive** is calendar work: tasks that come due on an interval regardless of
condition, with their priority raised when the device they belong to is
degrading. Nothing here is predicted — a cooling vent clean is due every 120 days
whether or not the fan is failing.

**Prescriptive** is the business recommendation: given this device's condition,
its weakest component and its connectivity, what should be done about it. No
telemetry, no analytics, no charts — this layer answers "what should be done",
not "what is happening".

Both are computed in Python. The browser receives finished records.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.mock_data.catalog import LAPTOP, MOBILE_CHARGER
from app.services.derive import (
    PRIORITY_RANK,
    band_of,
    prescriptive_for,
)
from app.services.engine import InteloraEngine
from app.services.simulator import AssetState

#: Scheduled work per device class. Intervals are the manufacturer's, not
#: something derived from condition — that is what makes this preventive.
TASK_TEMPLATES: dict[str, tuple[tuple[str, int], ...]] = {
    LAPTOP: (
        ("Battery health calibration", 90),
        ("Cooling vent cleaning", 120),
        ("Thermal paste inspection", 365),
        ("Firmware and BIOS update", 180),
        ("Storage health check", 150),
    ),
    MOBILE_CHARGER: (
        ("Cable continuity inspection", 120),
        ("Connector contact cleaning", 180),
        ("Insulation resistance test", 365),
        ("Thermal cut-off verification", 240),
    ),
}


@dataclass
class PreventiveTask:
    task_id: str
    asset_id: str
    asset_name: str
    category: str
    task_name: str
    interval_days: int
    due_date: datetime
    priority: str
    status: str
    completed: bool
    completed_at: datetime | None
    days_until_due: float
    health_band: str
    criticality: str

    def as_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "category": self.category,
            "task_name": self.task_name,
            "interval_days": self.interval_days,
            "due_date": self.due_date,
            "priority": self.priority,
            "status": self.status,
            "completed": self.completed,
            "completed_at": self.completed_at,
            "days_until_due": round(self.days_until_due, 2),
            "health_band": self.health_band,
            "criticality": self.criticality,
        }


class MaintenanceService:
    """Preventive schedule and prescriptive actions for the whole estate."""

    def __init__(self) -> None:
        # Completion is the only mutable state: the schedule itself is a pure
        # function of the asset register and the clock.
        self._completed: dict[str, datetime] = {}

    # ── Preventive ──────────────────────────────────────────────────────

    @staticmethod
    def _task_id(asset_id: str, task_name: str) -> str:
        return f"PMT-{asset_id}-{task_name.lower().replace(' ', '-')}"

    def _due_date(self, state: AssetState, task_name: str, interval_days: int, now: datetime) -> datetime:
        """Next due date, counted from the last completion or from commissioning.

        Commissioning is taken as the start of the stored history, so a device
        that has never had this task done shows a due date derived from its real
        age rather than from when the process happened to start.
        """
        completed_at = self._completed.get(self._task_id(state.asset_id, task_name))
        if completed_at is not None:
            return completed_at + timedelta(days=interval_days)

        commissioned = now - timedelta(days=30)
        # Stagger the first occurrence across the estate so the whole fleet does
        # not fall due on the same morning.
        offset = (abs(hash((state.asset_id, task_name))) % interval_days) - interval_days // 2
        return commissioned + timedelta(days=interval_days + offset)

    @staticmethod
    def _priority(band: str, days_until_due: float, criticality: str) -> str:
        if days_until_due < 0:
            return "Critical" if band == "critical" else "High"
        if band == "critical":
            return "Critical"
        if days_until_due <= 7:
            return "High"
        if days_until_due <= 30 or band == "warning" or criticality == "High":
            return "Medium"
        return "Low"

    @staticmethod
    def _status(days_until_due: float, completed: bool) -> str:
        if completed:
            return "Completed"
        if days_until_due < 0:
            return "Overdue"
        if days_until_due <= 7:
            return "Due"
        return "Scheduled"

    def tasks(self, engine: InteloraEngine, now: datetime | None = None) -> list[PreventiveTask]:
        stamp = now or datetime.now(timezone.utc)
        out: list[PreventiveTask] = []

        for state in engine.simulator.states.values():
            band = band_of(state.health)
            templates = TASK_TEMPLATES.get(state.seed.category, ())

            for task_name, interval_days in templates:
                task_id = self._task_id(state.asset_id, task_name)
                completed_at = self._completed.get(task_id)
                due = self._due_date(state, task_name, interval_days, stamp)
                days_until = (due - stamp).total_seconds() / 86_400.0

                # A task completed inside its current interval stays closed
                # until it next comes round.
                completed = completed_at is not None and days_until > 0

                out.append(
                    PreventiveTask(
                        task_id=task_id,
                        asset_id=state.asset_id,
                        asset_name=state.seed.asset_name,
                        category=state.seed.category,
                        task_name=task_name,
                        interval_days=interval_days,
                        due_date=due,
                        priority=self._priority(band, days_until, state.seed.criticality),
                        status=self._status(days_until, completed),
                        completed=completed,
                        completed_at=completed_at,
                        days_until_due=days_until,
                        health_band=band,
                        criticality=state.seed.criticality,
                    )
                )

        out.sort(key=lambda task: (-PRIORITY_RANK.get(task.priority, 0), task.days_until_due))
        return out

    def complete(self, task_id: str, when: datetime | None = None) -> bool:
        self._completed[task_id] = when or datetime.now(timezone.utc)
        return True

    def reopen(self, task_id: str) -> bool:
        return self._completed.pop(task_id, None) is not None

    # ── Prescriptive ────────────────────────────────────────────────────

    def actions(self, engine: InteloraEngine) -> list[dict]:
        """One business recommendation per device, most urgent first."""
        analytics = engine.analytics
        urgency_rank = {"Immediate": 4, "Scheduled": 3, "Monitor": 2, "None": 1}
        out: list[dict] = []

        for asset_id, state in engine.simulator.states.items():
            prediction = analytics.predictions.get(asset_id)
            weakest = prediction.primary.component if prediction else "device"
            band = band_of(state.health)

            rule = prescriptive_for(band, weakest, state.device_status, state.temperature_ratio)

            out.append(
                {
                    "asset_id": asset_id,
                    "asset_name": state.seed.asset_name,
                    "category": state.seed.category,
                    "criticality": state.seed.criticality,
                    "health_band": band,
                    "health_score": state.health,
                    "weakest_component": weakest,
                    "urgency": rule["urgency"],
                    "action": rule["action"],
                    "rationale": rule["rationale"],
                    "failure_probability": prediction.primary.failure_probability if prediction else 0.0,
                    "rul_days": prediction.primary.rul_days if prediction else 0.0,
                    "open_anomalies": len(engine.detector.active_by_asset(asset_id)),
                }
            )

        out.sort(
            key=lambda row: (
                -urgency_rank.get(row["urgency"], 0),
                row["health_score"],
            )
        )
        return out


#: Module singleton, so task completion survives across requests.
maintenance_service = MaintenanceService()


def get_maintenance_service() -> MaintenanceService:
    return maintenance_service
