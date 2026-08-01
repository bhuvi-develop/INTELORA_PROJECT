"""Asset performance and overall equipment effectiveness.

Availability is measured, not modelled: it is the share of observed time the
device was actually reporting. Performance and quality are functions of condition
and of the anomaly load the device has carried, so effectiveness moves with
health rather than alongside it — an asset whose health falls must show a lower
OEE, and it does, because the same health value feeds both.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.services.derive import (
    OEE_TARGET,
    OEE_WORLD_CLASS,
    availability_from_uptime,
    band_of,
    effectiveness_losses,
    oee_of,
    performance_from_health,
    quality_from_health,
    risk_tier_of,
)
from app.services.simulator import AssetState


@dataclass
class PerformanceResult:
    asset_id: str
    asset_name: str
    category: str
    criticality: str

    availability: float
    performance: float
    quality: float
    oee: float

    uptime_ratio: float
    mtbf_hours: float
    mttr_minutes: float

    energy_kwh: float
    energy_per_hour: float

    anomalies_24h: int
    health_score: float
    health_band: str
    risk_tier: str

    def as_row(self, computed_at: datetime) -> dict:
        return {
            "asset_id": self.asset_id,
            "availability": self.availability,
            "performance": self.performance,
            "quality": self.quality,
            "uptime_ratio": self.uptime_ratio,
            "mtbf_hours": self.mtbf_hours,
            "mttr_minutes": self.mttr_minutes,
            "energy_kwh": self.energy_kwh,
            "energy_per_hour": self.energy_per_hour,
            "anomalies_24h": self.anomalies_24h,
            "health_score": self.health_score,
            "health_band": self.health_band,
            "criticality": self.criticality,
            "risk_tier": self.risk_tier,
            "computed_at": computed_at,
        }

    def oee_row(self, computed_at: datetime) -> dict:
        losses = {step["key"]: step["loss"] for step in effectiveness_losses(
            self.availability, self.performance, self.quality
        )}
        return {
            "scope": "asset",
            "asset_id": self.asset_id,
            "availability": self.availability,
            "performance": self.performance,
            "quality": self.quality,
            "oee": self.oee,
            "target": OEE_TARGET,
            "world_class": OEE_WORLD_CLASS,
            "availability_loss": losses["availability"],
            "performance_loss": losses["performance"],
            "quality_loss": losses["quality"],
            "computed_at": computed_at,
        }


class PerformanceService:
    def compute(
        self,
        state: AssetState,
        anomalies_24h: int,
        active_critical: int,
        resolved_durations_minutes: list[float],
        failure_probability: float,
    ) -> PerformanceResult:
        availability = availability_from_uptime(state.uptime_ratio)
        performance = performance_from_health(state.health, state.temperature_ratio)
        quality = quality_from_health(state.health, anomalies_24h)
        effectiveness = oee_of(availability, performance, quality)

        # Mean time between failures over the observed run, and mean time to
        # restore from the events that actually cleared. Both are measured, and
        # both report zero rather than a placeholder when there is nothing to
        # measure yet.
        runtime = max(state.runtime_hours, 1e-6)
        mtbf = round(runtime / anomalies_24h, 2) if anomalies_24h > 0 else round(runtime, 2)
        mttr = (
            round(sum(resolved_durations_minutes) / len(resolved_durations_minutes), 2)
            if resolved_durations_minutes
            else 0.0
        )

        band = band_of(state.health)

        return PerformanceResult(
            asset_id=state.asset_id,
            asset_name=state.seed.asset_name,
            category=state.seed.category,
            criticality=state.seed.criticality,
            availability=availability,
            performance=performance,
            quality=quality,
            oee=effectiveness,
            uptime_ratio=round(state.uptime_ratio, 5),
            mtbf_hours=mtbf,
            mttr_minutes=mttr,
            energy_kwh=round(state.energy_kwh, 5),
            energy_per_hour=round(state.energy_kwh / runtime, 5),
            anomalies_24h=anomalies_24h,
            health_score=state.health,
            health_band=band,
            risk_tier=risk_tier_of(
                band, failure_probability, active_critical, state.device_status == "Offline"
            ),
        )

    @staticmethod
    def fleet_oee(results: list[PerformanceResult]) -> dict:
        """Estate effectiveness.

        Averaged across assets rather than recomputed from averaged factors: the
        product of three means is not the mean of three products, and quoting it
        as though it were would flatter a fleet with one very poor unit.
        """
        if not results:
            return {
                "availability": 0.0,
                "performance": 0.0,
                "quality": 0.0,
                "oee": 0.0,
                "target": OEE_TARGET,
                "world_class": OEE_WORLD_CLASS,
                "losses": effectiveness_losses(0.0, 0.0, 0.0),
            }

        count = len(results)
        availability = round(sum(entry.availability for entry in results) / count, 1)
        performance = round(sum(entry.performance for entry in results) / count, 1)
        quality = round(sum(entry.quality for entry in results) / count, 1)
        effectiveness = round(sum(entry.oee for entry in results) / count, 1)

        return {
            "availability": availability,
            "performance": performance,
            "quality": quality,
            "oee": effectiveness,
            "target": OEE_TARGET,
            "world_class": OEE_WORLD_CLASS,
            "losses": effectiveness_losses(availability, performance, quality),
        }

    @staticmethod
    def fleet_oee_row(fleet: dict, computed_at: datetime) -> dict:
        losses = {step["key"]: step["loss"] for step in fleet["losses"]}
        return {
            "scope": "fleet",
            "asset_id": None,
            "availability": fleet["availability"],
            "performance": fleet["performance"],
            "quality": fleet["quality"],
            "oee": fleet["oee"],
            "target": fleet["target"],
            "world_class": fleet["world_class"],
            "availability_loss": losses["availability"],
            "performance_loss": losses["performance"],
            "quality_loss": losses["quality"],
            "computed_at": computed_at,
        }

    @staticmethod
    def ranking(results: list[PerformanceResult]) -> list[dict]:
        """Fleet comparison, best effectiveness first.

        Comparison only — no telemetry appears in this projection, because a
        ranking answers which asset is performing, not what any one of them is
        reading at this instant.
        """
        ordered = sorted(results, key=lambda entry: entry.oee, reverse=True)
        return [
            {
                "rank": index + 1,
                "asset_id": entry.asset_id,
                "asset_name": entry.asset_name,
                "category": entry.category,
                "criticality": entry.criticality,
                "availability": entry.availability,
                "performance": entry.performance,
                "quality": entry.quality,
                "oee": entry.oee,
                "health_score": entry.health_score,
                "health_band": entry.health_band,
                "risk_tier": entry.risk_tier,
                "anomalies_24h": entry.anomalies_24h,
                "mtbf_hours": entry.mtbf_hours,
                "mttr_minutes": entry.mttr_minutes,
            }
            for index, entry in enumerate(ordered)
        ]

    @staticmethod
    def category_rollup(results: list[PerformanceResult]) -> list[dict]:
        buckets: dict[str, list[PerformanceResult]] = {}
        for entry in results:
            buckets.setdefault(entry.category, []).append(entry)

        rollups = []
        for category, entries in buckets.items():
            count = len(entries)
            rollups.append(
                {
                    "category": category,
                    "assets": count,
                    "average_health": round(sum(e.health_score for e in entries) / count, 1),
                    "availability": round(sum(e.availability for e in entries) / count, 1),
                    "oee": round(sum(e.oee for e in entries) / count, 1),
                    "energy_kwh": round(sum(e.energy_kwh for e in entries), 4),
                    "anomalies": sum(e.anomalies_24h for e in entries),
                }
            )
        return sorted(rollups, key=lambda entry: entry["category"])
