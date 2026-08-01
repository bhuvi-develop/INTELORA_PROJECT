"""Preventive schedule and prescriptive actions."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routers.deps import build_meta, get_engine
from app.services.derive import PRIORITY_RANK
from app.services.engine import InteloraEngine
from app.services.maintenance_service import MaintenanceService, get_maintenance_service

preventive_router = APIRouter(prefix="/preventive", tags=["Preventive Maintenance"])
prescriptive_router = APIRouter(prefix="/prescriptive", tags=["Prescriptive Maintenance"])


@preventive_router.get("", summary="Scheduled maintenance tasks")
def read_preventive(
    asset_id: str | None = Query(default=None),
    category: str | None = Query(default=None),
    task_status: str | None = Query(
        default=None, alias="status", description="Scheduled, Due, Overdue or Completed"
    ),
    priority: str | None = Query(default=None, description="Critical, High, Medium or Low"),
    engine: InteloraEngine = Depends(get_engine),
    service: MaintenanceService = Depends(get_maintenance_service),
) -> dict:
    """Calendar-driven work.

    Intervals come from the manufacturer's schedule, not from condition — that is
    what separates preventive work from predictive. Condition only raises the
    priority of a task that was already due.
    """
    now = datetime.now(timezone.utc)
    tasks = service.tasks(engine, now)

    selected = [
        task
        for task in tasks
        if (asset_id is None or task.asset_id == asset_id)
        and (category is None or task.category == category)
        and (task_status is None or task.status == task_status)
        and (priority is None or task.priority == priority)
    ]

    return {
        "tasks": [task.as_dict() for task in selected],
        "total": len(tasks),
        "returned": len(selected),
        "overdue": sum(1 for task in tasks if task.status == "Overdue"),
        "due": sum(1 for task in tasks if task.status == "Due"),
        "scheduled": sum(1 for task in tasks if task.status == "Scheduled"),
        "completed": sum(1 for task in tasks if task.status == "Completed"),
        "by_priority": {
            level: sum(1 for task in tasks if task.priority == level) for level in PRIORITY_RANK
        },
        "meta": build_meta(engine),
    }


@preventive_router.post("/{task_id}/complete", summary="Sign off a task")
def complete_task(
    task_id: str,
    engine: InteloraEngine = Depends(get_engine),
    service: MaintenanceService = Depends(get_maintenance_service),
) -> dict:
    now = datetime.now(timezone.utc)
    known = {task.task_id for task in service.tasks(engine, now)}
    if task_id not in known:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No task {task_id}")

    service.complete(task_id, now)
    return {"task_id": task_id, "completed": True, "completed_at": now}


@preventive_router.post("/{task_id}/reopen", summary="Reopen a completed task")
def reopen_task(
    task_id: str,
    service: MaintenanceService = Depends(get_maintenance_service),
) -> dict:
    reopened = service.reopen(task_id)
    if not reopened:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Task {task_id} is not marked complete"
        )
    return {"task_id": task_id, "completed": False}


@prescriptive_router.get("", summary="Business recommendations per device")
def read_prescriptive(
    urgency: str | None = Query(default=None, description="Immediate, Scheduled, Monitor or None"),
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
    service: MaintenanceService = Depends(get_maintenance_service),
) -> dict:
    """What should be done, and why.

    Deliberately free of telemetry, charts and analytics: this layer answers what
    should be done about a device, not what it is currently reading.
    """
    actions = service.actions(engine)

    selected = [
        action
        for action in actions
        if (urgency is None or action["urgency"] == urgency)
        and (category is None or action["category"] == category)
    ]

    return {
        "actions": selected,
        "total": len(actions),
        "returned": len(selected),
        "by_urgency": {
            level: sum(1 for action in actions if action["urgency"] == level)
            for level in ("Immediate", "Scheduled", "Monitor", "None")
        },
        "meta": build_meta(engine),
    }
