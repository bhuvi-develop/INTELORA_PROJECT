# Anomaly Detection Report

## Overview
This report documents the existing anomaly detection implementation in the project, including the modules, functions, formulas, and data flow used to detect anomalies.

---

## Modules used

- `backend/app/services/anomaly_service.py`
  - Main detection pipeline
  - Threshold checks, hysteresis, event state, anomaly creation/clearing
- `backend/app/services/derive.py`
  - `ANOMALY_DEFS`
  - `anomaly_severity()`
  - `anomaly_detail()`
- `backend/app/ml/anomaly_model.py`
  - `AnomalyScorer`
  - Isolation forest scoring and fallback robust z-score
- `backend/app/ml/features.py`
  - `ANOMALY_FEATURES`
  - `to_matrix()`
  - `to_vector()`
  - `is_degenerate()`

---

## Detection flow

1. `AnomalyDetector.evaluate(state, reading, dt)` is called for each new reading.
2. The detector computes device-specific thresholds via `thresholds_for(profile)`.
3. It computes an anomaly model score using `self.scorer.score(asset_id, reading)`.
4. It checks every rule using `_checks(state, reading, limits)`.
5. It applies hysteresis and state transitions through `_apply(...)`.
6. If a breach persists long enough, `_raise(...)` creates an `AnomalyEvent`.
7. If a previously open event stays inside margin long enough, `_resolve(...)` clears it.

---

## Threshold formulas

Computed from the asset profile:

- `voltage_high = nominal_voltage * (1.0 + voltage_tolerance)`
- `voltage_low = nominal_voltage * (1.0 - voltage_tolerance)`
- `current_max = profile.max_current_a`
- `power_max = profile.rated_power_w * 1.15`
- `temperature_max = profile.max_temperature_c`
- `power_factor_min = 0.62`
- `frequency_nominal = profile.nominal_frequency`
- `frequency_band = 0.8`

---

## Anomaly rules

Rules evaluated in `_checks(...)`:

- `communication-lost`
- `voltage-high`
- `voltage-low`
- `current-spike`
- `power-surge`
- `temperature-high`
- `frequency-deviation`
- `power-factor-low`
- `energy-spike`

### `energy-spike`

- Computes recent and baseline energy rate from the live history window.
- Rate formula: `(energy_last - energy_first) / span_hours`
- Condition: `recent > baseline * 1.6`

---

## Hysteresis and timing

Each anomaly type has configured durations in `ANOMALY_DEFS`:

- `confirm_seconds` — how long the breach must persist before raising
- `clear_seconds` — how long the reading must remain inside margin before clearing

Example durations:

- `voltage-high`: confirm 6s, clear 12s
- `current-spike`: confirm 3s, clear 8s
- `temperature-high`: confirm 8s, clear 20s
- `energy-spike`: confirm 60s, clear 60s
- `communication-lost`: confirm 3s, clear 3s

### Inside-margin condition

`_inside_margin(...)` ensures the reading returns safely inside the threshold before clearing:

- `voltage-low` and `power-factor-low`: `observed > limit * (1.0 + CLEAR_MARGIN)`
- `frequency-deviation`: `abs(observed - limit) < 0.8 * (1.0 - CLEAR_MARGIN)`
- otherwise: `observed < limit * (1.0 - CLEAR_MARGIN)`
- `CLEAR_MARGIN = 0.03`

---

## Severity calculation

From `anomaly_severity(anomaly_type, observed, threshold)`:

- `communication-lost` → `Critical`
- `threshold == 0` → `Warning`
- `overshoot = abs(observed - threshold) / abs(threshold)`
- `Critical` if `overshoot >= 0.18`
- `Major` if `overshoot >= 0.08`
- `Warning` if `overshoot >= 0.025`
- otherwise `Info`

---

## Model score and confidence

The anomaly model score is computed in `AnomalyScorer.score(asset_id, reading)`.

### If the model is fitted and available:

- Build feature vector from reading using `to_vector(reading)`
- Transform with `StandardScaler`
- Compute `raw = forest.score_samples(scaled_vector)[0]`
- Normalize to `[0, 1]` with:
  - `normalised = (-raw - 0.35) / 0.40`

### Fallback robust z-score if the forest is unavailable:

- `deviation = abs(vector[0] - centre) / spread`
- `worst = max(deviation)`
- score = `clamp((worst - 3.0) / 5.0, 0.0, 1.0)`

### Confidence mapping in `_raise(...)`

- If score ≥ 0.6:
  - `method = "hybrid"`
  - `confidence = min(0.99, 0.72 + score * 0.25)`
- Else if score > 0.0:
  - `method = "rule+model"`
  - `confidence = min(0.95, 0.68 + score * 0.2)`
- Else:
  - `method = "rule"`
  - `confidence = 0.68`

---

## Feature extraction used by the model

From `backend/app/ml/features.py`:

- `ANOMALY_FEATURES`
  - `("voltage", "current", "active_power", "power_factor", "temperature", "frequency")`
- `to_matrix(readings)` builds a float matrix from a reading history
- `to_vector(reading)` builds a single-sample input vector for scoring
- `is_degenerate(matrix)` returns true if the training window has too little variance

---

## Notes

- The rule determines whether an event is raised; the model only corroborates and influences confidence.
- The model score itself cannot raise an event.
- The current implementation is per-asset; every asset has its own model and thresholds are device-specific.
