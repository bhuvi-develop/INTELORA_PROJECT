"""Unsupervised anomaly scoring.

An isolation forest is fitted per device against its own recent behaviour, and
scores each new reading on how far it sits from that behaviour. The model does
not decide whether an alert is raised — a threshold rule does that, because an
operator needs to know which limit was broken and by how much. What the model
contributes is a continuous score that catches the combinations no single
threshold covers: nominal voltage and nominal current arriving together in a
pattern this device has never produced before.

Each device is scored against itself. A charger drawing 2 A is unremarkable for
a charger and impossible for the laptop next to it, and a single fleet-wide
model would have to average that difference away.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

from app.config import settings
from app.logging_config import get_logger
from app.ml.features import ANOMALY_FEATURES, is_degenerate, to_matrix, to_vector

logger = get_logger(__name__)

try:  # scikit-learn is a hard requirement, but the service must not die without it.
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler

    SKLEARN_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only on a broken install
    IsolationForest = None  # type: ignore[assignment]
    StandardScaler = None  # type: ignore[assignment]
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn unavailable — anomaly scoring falls back to robust z-scores")


@dataclass
class AssetModel:
    asset_id: str
    forest: object | None = None
    scaler: object | None = None
    fitted_at: float = 0.0
    samples_seen: int = 0
    #: Median and median-absolute-deviation per channel, kept for the fallback
    #: path and for explaining which channel drove a score.
    centre: np.ndarray | None = None
    spread: np.ndarray | None = None
    channels: tuple[str, ...] = field(default=ANOMALY_FEATURES)


class AnomalyScorer:
    """Per-asset isolation forests with a statistical fallback."""

    def __init__(self) -> None:
        self._models: dict[str, AssetModel] = {}

    # ── Fitting ─────────────────────────────────────────────────────────

    def maybe_fit(self, asset_id: str, readings) -> bool:
        """Refit if enough history has accumulated and the interval has elapsed."""
        if not settings.ml_enabled:
            return False

        model = self._models.get(asset_id)
        now = time.monotonic()
        if model is not None and now - model.fitted_at < settings.ml_refit_interval_seconds:
            return False

        # Offline samples are not measurements of the device; they are the
        # absence of one. Training on their zeros would teach the model that
        # zero volts is normal for this asset.
        usable = [reading for reading in readings if reading.device_status != "Offline"]
        if len(usable) < settings.ml_min_training_samples:
            return False

        matrix = to_matrix(usable)
        if is_degenerate(matrix):
            return False

        centre = np.median(matrix, axis=0)
        spread = np.median(np.abs(matrix - centre), axis=0) * 1.4826
        spread[spread < 1e-6] = 1e-6

        fitted = AssetModel(
            asset_id=asset_id,
            fitted_at=now,
            samples_seen=len(usable),
            centre=centre,
            spread=spread,
        )

        if SKLEARN_AVAILABLE:
            try:
                scaler = StandardScaler().fit(matrix)
                forest = IsolationForest(
                    n_estimators=120,
                    contamination=settings.ml_contamination,
                    max_samples=min(256, len(usable)),
                    random_state=17,
                    n_jobs=1,
                ).fit(scaler.transform(matrix))
                fitted.scaler = scaler
                fitted.forest = forest
            except Exception as error:  # pragma: no cover - defensive
                logger.warning("isolation forest fit failed for %s: %s", asset_id, error)

        self._models[asset_id] = fitted
        return True

    # ── Scoring ─────────────────────────────────────────────────────────

    def score(self, asset_id: str, reading) -> float:
        """Anomaly score in [0, 1]. Zero means indistinguishable from normal."""
        model = self._models.get(asset_id)
        if model is None or reading.device_status == "Offline":
            return 0.0

        vector = to_vector(reading)

        if model.forest is not None and model.scaler is not None:
            try:
                # `score_samples` is higher for more normal points and typically
                # lands between −0.75 and −0.35 on this data. Map it onto [0,1]
                # so the stored score means the same thing for every device.
                raw = float(model.forest.score_samples(model.scaler.transform(vector))[0])
                normalised = (-raw - 0.35) / 0.40
                return round(min(1.0, max(0.0, normalised)), 4)
            except Exception as error:  # pragma: no cover - defensive
                logger.debug("scoring failed for %s, using fallback: %s", asset_id, error)

        return self._robust_z(model, vector)

    @staticmethod
    def _robust_z(model: AssetModel, vector: np.ndarray) -> float:
        """Median-absolute-deviation distance, used when no forest is available."""
        if model.centre is None or model.spread is None:
            return 0.0
        deviation = np.abs(vector[0] - model.centre) / model.spread
        worst = float(np.max(deviation))
        # Three MADs is unremarkable; eight is the ceiling of the scale.
        return round(min(1.0, max(0.0, (worst - 3.0) / 5.0)), 4)

    def dominant_channel(self, asset_id: str, reading) -> str | None:
        """Which channel is furthest from normal — the model's explanation."""
        model = self._models.get(asset_id)
        if model is None or model.centre is None or model.spread is None:
            return None
        vector = to_vector(reading)
        deviation = np.abs(vector[0] - model.centre) / model.spread
        return model.channels[int(np.argmax(deviation))]

    def is_fitted(self, asset_id: str) -> bool:
        return asset_id in self._models

    def status(self) -> dict[str, dict]:
        return {
            asset_id: {
                "fitted": model.forest is not None,
                "method": "isolation-forest" if model.forest is not None else "robust-z",
                "training_samples": model.samples_seen,
            }
            for asset_id, model in self._models.items()
        }
