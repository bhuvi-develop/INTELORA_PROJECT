"""Predictive maintenance.

For every serviceable component: how worn it is, how likely it is to fail inside
the horizon, how long it has left, how confident the platform is, and what should
be done about it. The asset-level headline is its weakest component, because that
is the part that will take the device out of service.

All of it is computed here in Python. The browser receives finished numbers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.ml.degradation_model import DegradationModel
from app.services.derive import (
    PREDICTION_HORIZON_DAYS,
    failure_probability,
    maintenance_priority,
    prediction_confidence,
    recommendation_for,
    rul_days_from_wear,
)
from app.services.simulator import AssetState


@dataclass
class ComponentPrediction:
    asset_id: str
    component: str
    wear: float
    failure_probability: float
    rul_days: float
    confidence: float
    recommendation: str
    maintenance_priority: str
    predicted_failure_at: datetime | None
    model_version: str
    horizon_days: int = PREDICTION_HORIZON_DAYS
    #: Weight the regression carried in the published remaining-life figure.
    regression_weight: float = 0.0

    def as_row(self, computed_at: datetime) -> dict:
        return {
            "asset_id": self.asset_id,
            "component": self.component,
            "wear": self.wear,
            "failure_probability": self.failure_probability,
            "rul_days": self.rul_days,
            "confidence": self.confidence,
            "predicted_failure_at": self.predicted_failure_at,
            "recommendation": self.recommendation,
            "maintenance_priority": self.maintenance_priority,
            "model_version": self.model_version,
            "horizon_days": self.horizon_days,
            "computed_at": computed_at,
        }


@dataclass
class AssetPrediction:
    asset_id: str
    asset_name: str
    category: str
    criticality: str
    #: Weakest component — the one that decides the asset's fate.
    primary: ComponentPrediction
    components: list[ComponentPrediction]
    horizon_days: int = PREDICTION_HORIZON_DAYS


class PredictiveService:
    def __init__(self, degradation: DegradationModel | None = None) -> None:
        self.degradation = degradation or DegradationModel()

    def refresh_fit(self, state: AssetState) -> None:
        """Re-fit the degradation regression for one asset from its live window."""
        self.degradation.fit(state.asset_id, list(state.history))

    def clean_predict(self, state: AssetState, now: datetime) -> AssetPrediction:
        predictions: list[ComponentPrediction] = []
        for spec in state.profile.components:
            predictions.append(
                ComponentPrediction(
                    asset_id=state.asset_id,
                    component=spec.name,
                    wear=0.0,
                    failure_probability=0.0,
                    rul_days=999.0,
                    confidence=1.0,
                    recommendation="No action needed — Device operating within safe nominal parameters.",
                    maintenance_priority="Normal",
                    predicted_failure_at=None,
                    model_version="Nominal",
                    regression_weight=0.0,
                )
            )

        primary = predictions[0]
        return AssetPrediction(
            asset_id=state.asset_id,
            asset_name=state.seed.asset_name,
            category=state.seed.category,
            criticality=state.seed.criticality,
            primary=primary,
            components=predictions,
        )

    def predict(self, state: AssetState, now: datetime) -> AssetPrediction:
        predictions: list[ComponentPrediction] = []
        confidence_bonus = self.degradation.confidence_bonus(state.asset_id)

        for position, spec in enumerate(state.profile.components):
            wear = state.wear[position] if position < len(state.wear) else 0.0
            rate = (
                state.wear_rate[position]
                if position < len(state.wear_rate) and state.wear_rate[position] > 0
                else spec.base_wear_per_day * state.seed.duty_factor
            )

            probability = failure_probability(wear, rate)
            probability = self.degradation.ratcheted_probability(state.asset_id, spec.name, probability)

            analytical = rul_days_from_wear(wear, rate)
            rul, method, weight = self.degradation.blended_rul(
                state.asset_id, spec.name, analytical, state.health
            )

            confidence = min(0.99, prediction_confidence(probability, state.tick) + confidence_bonus)

            predictions.append(
                ComponentPrediction(
                    asset_id=state.asset_id,
                    component=spec.name,
                    wear=round(wear, 5),
                    failure_probability=probability,
                    rul_days=rul,
                    confidence=round(confidence, 3),
                    recommendation=recommendation_for(spec.name, probability, rul),
                    maintenance_priority=maintenance_priority(
                        state.band, rul, probability, state.seed.criticality
                    ),
                    predicted_failure_at=now + timedelta(days=rul) if rul < 3650 else None,
                    model_version=method,
                    regression_weight=weight,
                )
            )

        # The weakest link decides: soonest end of life first, then the highest
        # probability of getting there.
        primary = min(predictions, key=lambda entry: (entry.rul_days, -entry.failure_probability))

        return AssetPrediction(
            asset_id=state.asset_id,
            asset_name=state.seed.asset_name,
            category=state.seed.category,
            criticality=state.seed.criticality,
            primary=primary,
            components=predictions,
        )

    @staticmethod
    def component_queue(predictions: list[AssetPrediction]) -> list[ComponentPrediction]:
        """Every component across the estate, soonest end of life first."""
        rows = [component for prediction in predictions for component in prediction.components]
        return sorted(rows, key=lambda entry: entry.rul_days)

    @staticmethod
    def rul_distribution(predictions: list[AssetPrediction]) -> list[dict]:
        """Assets bucketed by how long their weakest component has left."""
        bands = [
            ("< 7 d", 0.0, 7.0),
            ("7–30 d", 7.0, 30.0),
            ("30–90 d", 30.0, 90.0),
            ("90–180 d", 90.0, 180.0),
            ("> 180 d", 180.0, float("inf")),
        ]
        return [
            {
                "label": label,
                "max_days": None if high == float("inf") else high,
                "count": sum(
                    1 for entry in predictions if low < entry.primary.rul_days <= high
                ),
            }
            for label, low, high in bands
        ]
