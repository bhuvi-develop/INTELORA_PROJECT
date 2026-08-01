"""Degradation modelling.

Remaining useful life has two estimators and the service uses both.

The analytical one divides the distance left to the failure boundary by the
component's own wear rate. It is available from the first second and is exactly
right about the model that produced the wear.

The regression one fits observed health against time and extrapolates to the
failure threshold. It knows nothing about wear rates and everything about what
the device has actually been doing, so it responds to a machine that has started
running hot in a way the analytical figure cannot.

They are blended by how much history the regression has had, and the published
figure is ratcheted: reported remaining life only ever tightens and reported
failure probability only ever rises. A device cannot get younger, so a prediction
that improves is a prediction that was wrong, and letting it wander would make
the number useless for planning.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import settings
from app.logging_config import get_logger
from app.ml.features import health_series
from app.mock_data.signals import clamp, clamp01

logger = get_logger(__name__)

try:
    from sklearn.linear_model import LinearRegression

    SKLEARN_AVAILABLE = True
except ImportError:  # pragma: no cover
    LinearRegression = None  # type: ignore[assignment]
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn unavailable — degradation falls back to least squares")


#: Health at which an asset is treated as failed for projection purposes.
FAILURE_HEALTH = 40.0


@dataclass
class DegradationFit:
    asset_id: str
    #: Health points lost per day. Negative when the device is degrading.
    slope_per_day: float
    intercept: float
    r_squared: float
    samples: int
    span_days: float
    method: str = "regression"

    @property
    def is_usable(self) -> bool:
        # A fit needs a real span and a real trend. An hour of flat readings
        # extrapolates to nonsense in either direction.
        return self.samples >= 30 and self.span_days > 0.002 and self.slope_per_day < -1e-6

    def days_to(self, current_health: float, threshold: float = FAILURE_HEALTH) -> float | None:
        if not self.is_usable:
            return None
        remaining = current_health - threshold
        if remaining <= 0:
            return 0.0
        return float(clamp(remaining / abs(self.slope_per_day), 0.0, 3650.0))


@dataclass
class _Ratchet:
    """Published figures, held so they can only move one way."""

    rul_days: float | None = None
    failure_probability: float | None = None


class DegradationModel:
    def __init__(self) -> None:
        self._fits: dict[str, DegradationFit] = {}
        self._ratchets: dict[str, dict[str, _Ratchet]] = {}
        self._span: dict[str, float] = {}

    # ── Fitting ─────────────────────────────────────────────────────────

    def fit(self, asset_id: str, readings) -> DegradationFit | None:
        """Fit health against time for one asset."""
        usable = [reading for reading in readings if reading.device_status != "Offline"]
        days, health = health_series(usable)
        if days.size < 30:
            return None

        span = float(days[-1] - days[0])
        if span <= 0.0:
            return None

        if SKLEARN_AVAILABLE:
            model = LinearRegression().fit(days.reshape(-1, 1), health)
            slope = float(model.coef_[0])
            intercept = float(model.intercept_)
            predicted = model.predict(days.reshape(-1, 1))
        else:  # pragma: no cover - only on a broken install
            slope, intercept = np.polyfit(days, health, 1)
            slope = float(slope)
            intercept = float(intercept)
            predicted = slope * days + intercept

        residual = float(np.sum((health - predicted) ** 2))
        total = float(np.sum((health - float(np.mean(health))) ** 2))
        r_squared = 1.0 - residual / total if total > 1e-12 else 0.0

        fit = DegradationFit(
            asset_id=asset_id,
            slope_per_day=slope,
            intercept=intercept,
            r_squared=round(clamp01(r_squared), 4),
            samples=int(days.size),
            span_days=round(span, 6),
            method="regression" if SKLEARN_AVAILABLE else "least-squares",
        )
        self._fits[asset_id] = fit
        self._span[asset_id] = span
        return fit

    def fit_for(self, asset_id: str) -> DegradationFit | None:
        return self._fits.get(asset_id)

    # ── Blending ────────────────────────────────────────────────────────

    def blended_rul(
        self,
        asset_id: str,
        component: str,
        analytical_days: float,
        current_health: float,
    ) -> tuple[float, str, float]:
        """Combine both estimators and ratchet the result.

        Returns the published remaining life, the method behind it, and the
        weight the regression carried.
        """
        fit = self._fits.get(asset_id)
        published = analytical_days
        method = "wear-rate-1.0"
        weight = 0.0

        if fit is not None and fit.is_usable:
            projected = fit.days_to(current_health)
            if projected is not None:
                # Trust the regression in proportion to how well it explains the
                # history it was fitted to, capped so it never fully displaces
                # the physical model.
                weight = float(clamp(fit.r_squared, 0.0, 0.65))
                published = analytical_days * (1.0 - weight) + projected * weight
                method = "hybrid-regression-1.0" if weight > 0.05 else "wear-rate-1.0"

        ratchet = self._ratchets.setdefault(asset_id, {}).setdefault(component, _Ratchet())
        if ratchet.rul_days is not None:
            published = min(published, ratchet.rul_days)
        ratchet.rul_days = published

        return round(max(0.0, published), 1), method, round(weight, 3)

    def ratcheted_probability(self, asset_id: str, component: str, probability: float) -> float:
        ratchet = self._ratchets.setdefault(asset_id, {}).setdefault(component, _Ratchet())
        if ratchet.failure_probability is not None:
            probability = max(probability, ratchet.failure_probability)
        ratchet.failure_probability = probability
        return round(clamp01(probability), 4)

    def confidence_bonus(self, asset_id: str) -> float:
        """Extra confidence earned by a well-explained fit over a real span."""
        fit = self._fits.get(asset_id)
        if fit is None or not fit.is_usable:
            return 0.0
        return round(clamp(fit.r_squared * 0.12 + min(0.06, fit.span_days * 0.01), 0.0, 0.15), 4)

    def status(self) -> dict[str, dict]:
        return {
            asset_id: {
                "slope_health_per_day": round(fit.slope_per_day, 5),
                "r_squared": fit.r_squared,
                "samples": fit.samples,
                "span_days": fit.span_days,
                "usable": fit.is_usable,
                "method": fit.method,
            }
            for asset_id, fit in self._fits.items()
        }


#: Enabled only when the interpreter has scikit-learn; the service checks this
#: to report honestly on /api/system/status rather than claiming a model it does
#: not have.
ML_BACKEND = "scikit-learn" if SKLEARN_AVAILABLE else "numpy-fallback"
