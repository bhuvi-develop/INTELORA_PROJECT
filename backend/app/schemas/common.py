"""Shared response primitives."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

HealthBand = Literal["healthy", "good", "warning", "critical"]
Severity = Literal["Critical", "Major", "Warning", "Info"]
DeviceStatus = Literal["Online", "Standby", "Offline"]
RiskTier = Literal["critical", "high", "medium", "low", "healthy"]
Criticality = Literal["High", "Medium", "Low"]
Resolution = Literal["second", "minute", "quarter", "hour"]


class ApiModel(BaseModel):
    """Base for every response model.

    `from_attributes` lets a router hand back an ORM row or a service dataclass
    without an intermediate dictionary, which keeps one shape between the layer
    that computed a figure and the layer that publishes it.
    """

    model_config = ConfigDict(from_attributes=True)


class Meta(ApiModel):
    generated_at: datetime
    tick: int = Field(description="Simulation ticks processed since the engine started")
    analytics_tick: int = Field(
        default=0,
        description=(
            "Tick the cached derived state was computed from. Predictions and effectiveness are "
            "recomputed on a slower cadence than the tick, so this says how old those figures are; "
            "condition and open-alarm counts are always current as of `tick`."
        ),
    )
    source: str = "mikos-simulator"


class Envelope(ApiModel):
    """Wrapper used by list endpoints so a caller can page without guessing."""

    total: int
    returned: int
    meta: Meta


class BandCount(ApiModel):
    band: HealthBand
    label: str
    #: Inclusive lower bound of the band, published so a consumer colours a
    #: value against the same boundary the platform judged it by.
    min: float
    count: int
    share_pct: float


class TierCount(ApiModel):
    tier: RiskTier
    count: int
    share_pct: float


class LossStep(ApiModel):
    key: str
    label: str
    loss: float
    detail: str
