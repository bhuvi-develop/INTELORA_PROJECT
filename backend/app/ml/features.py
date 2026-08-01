"""Feature extraction shared by the models.

Both models read the same rolling window the live APIs read, so a score is
always computed from the data an operator can see on screen — there is no
hidden feature store that could disagree with the chart.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

#: Channels the anomaly model reasons over. Energy and runtime are excluded on
#: purpose: both increase monotonically, so an isolation forest would flag the
#: newest sample every time simply for being the largest.
ANOMALY_FEATURES: tuple[str, ...] = (
    "voltage",
    "current",
    "active_power",
    "power_factor",
    "temperature",
    "frequency",
)


def to_matrix(readings: Sequence, columns: tuple[str, ...] = ANOMALY_FEATURES) -> np.ndarray:
    """Stack readings into a float matrix, one row per sample."""
    if not readings:
        return np.empty((0, len(columns)), dtype=float)
    return np.asarray(
        [[float(getattr(reading, column)) for column in columns] for reading in readings],
        dtype=float,
    )


def to_vector(reading, columns: tuple[str, ...] = ANOMALY_FEATURES) -> np.ndarray:
    return np.asarray([[float(getattr(reading, column)) for column in columns]], dtype=float)


def health_series(readings: Sequence) -> tuple[np.ndarray, np.ndarray]:
    """Elapsed days and health score, for the degradation fit.

    Time is expressed in days from the first sample so the regression slope is
    directly a health-points-per-day figure rather than something that has to be
    rescaled afterwards.
    """
    if len(readings) < 2:
        return np.empty(0), np.empty(0)

    origin = readings[0].ts
    days = np.asarray(
        [(reading.ts - origin).total_seconds() / 86_400.0 for reading in readings], dtype=float
    )
    health = np.asarray([float(reading.health_score) for reading in readings], dtype=float)
    return days, health


def is_degenerate(matrix: np.ndarray) -> bool:
    """True when a matrix carries no variance worth fitting.

    A device that has sat perfectly still produces a column of identical values;
    fitting an outlier detector to it yields a model that calls the next
    ordinary sample an outlier.
    """
    if matrix.size == 0 or matrix.shape[0] < 2:
        return True
    return bool(np.all(np.nanstd(matrix, axis=0) < 1e-9))
