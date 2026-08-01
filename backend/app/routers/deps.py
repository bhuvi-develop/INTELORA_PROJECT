"""Shared router dependencies."""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.common import Meta
from app.services.engine import InteloraEngine, get_engine

__all__ = ["build_meta", "get_engine", "InteloraEngine"]


def build_meta(engine: InteloraEngine) -> Meta:
    """Stamp every response with when it was produced and which tick produced it.

    Two responses carrying the same tick were computed from the same estate
    state, which is what lets a caller reason about whether two panels on a
    screen are showing the same instant.
    """
    return Meta(
        generated_at=datetime.now(timezone.utc),
        tick=engine.tick,
        analytics_tick=engine.analytics.tick,
        source="mikos-simulator",
    )
