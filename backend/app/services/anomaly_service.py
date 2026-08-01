"""Anomaly detection.

Two independent judgements are combined.

A **rule** decides whether an event is raised. Each reading is compared with the
limits held on the device's own profile — a 35 W charger and a 96 W laptop are
each judged against their own rating — and a breach must persist before it is
reported. A single noisy sample never becomes an alert, and an event only clears
once the reading has returned inside the limit with margin and stayed there.
That hysteresis is why the journal reads as a list of faults rather than a list
of samples.

A **model** scores how unusual the reading is for that device. It cannot raise
an event on its own, because an operator needs to be told which limit broke, but
it is stored with every event and it raises the confidence when it agrees.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.logging_config import get_logger
from app.ml.anomaly_model import AnomalyScorer
from app.mock_data.catalog import CategoryProfile
from app.services.derive import (
    ANOMALY_DEFS,
    RESPONSE_TARGET_MINUTES,
    SEVERITY_RANK,
    anomaly_detail,
    anomaly_severity,
)
from app.services.simulator import AssetState, Reading

logger = get_logger(__name__)

#: Fraction inside the limit a reading must return before an event clears.
CLEAR_MARGIN = 0.03

#: Power factor is meaningless at no load, so it is only judged once the device
#: is drawing a meaningful fraction of its rating.
PF_EVALUATION_FLOOR = 0.10


@dataclass
class AnomalyEvent:
    uid: str
    asset_id: str
    asset_name: str
    category: str
    component: str | None

    error_code: str
    anomaly_type: str
    title: str
    severity: str
    status: str

    channel: str
    observed_value: float
    threshold_value: float
    unit: str
    deviation_pct: float

    anomaly_score: float
    detection_method: str
    confidence: float
    detail: str

    detected_at: datetime
    resolved_at: datetime | None = None
    acknowledged_at: datetime | None = None
    response_target_minutes: int = 60
    #: Ground-truth mechanism when the reading was distorted by an injected
    #: fault. Recorded so root-cause analysis can be evaluated honestly.
    mechanism: str | None = None
    #: Written to PostgreSQL at least once.
    persisted: bool = False
    #: Changed since it was last written — the persistence pass only touches
    #: rows whose lifecycle actually moved, rather than rewriting the journal.
    dirty: bool = False

    @property
    def is_open(self) -> bool:
        return self.status != "Resolved"

    def minutes_open(self, now: datetime) -> float:
        end = self.resolved_at or now
        return max(0.0, (end - self.detected_at).total_seconds() / 60.0)


@dataclass
class _Breach:
    """How long a limit has been broken, and how long it has been back inside."""

    breaching_seconds: float = 0.0
    clear_seconds: float = 0.0
    open_uid: str | None = None
    peak_observed: float = 0.0


@dataclass
class _Thresholds:
    voltage_high: float
    voltage_low: float
    current_max: float
    power_max: float
    temperature_max: float
    power_factor_min: float
    frequency_nominal: float
    frequency_band: float


def thresholds_for(profile: CategoryProfile) -> _Thresholds:
    """Operating limits derived from the device's own rating."""
    return _Thresholds(
        voltage_high=profile.nominal_voltage * (1.0 + profile.voltage_tolerance),
        voltage_low=profile.nominal_voltage * (1.0 - profile.voltage_tolerance),
        current_max=profile.max_current_a,
        power_max=profile.rated_power_w * 1.15,
        temperature_max=profile.max_temperature_c,
        power_factor_min=0.62,
        frequency_nominal=profile.nominal_frequency,
        frequency_band=0.8,
    )


class AnomalyDetector:
    """Threshold evaluation with hysteresis, plus model corroboration."""

    def __init__(self, scorer: AnomalyScorer | None = None) -> None:
        self.scorer = scorer or AnomalyScorer()
        self._breaches: dict[str, dict[str, _Breach]] = {}
        self.journal: list[AnomalyEvent] = []
        self._by_uid: dict[str, AnomalyEvent] = {}

    # ── Evaluation ──────────────────────────────────────────────────────

    def evaluate(self, state: AssetState, reading: Reading, dt: float) -> list[AnomalyEvent]:
        """Judge one reading. Returns the events raised or resolved by it."""
        thresholds = thresholds_for(state.profile)
        changed: list[AnomalyEvent] = []

        score = self.scorer.score(state.asset_id, reading)

        if reading.device_status == "Offline":
            # The platform can no longer observe this device, so it can no
            # longer assert that an electrical or thermal limit is being broken.
            # Leaving those events open would put an impossible reading on
            # screen: a temperature alarm on an endpoint publishing nothing.
            changed.extend(self._close_unobservable(state.asset_id, reading.ts))

        for anomaly_type, breached, observed, limit in self._checks(state, reading, thresholds):
            event = self._apply(state, reading, anomaly_type, breached, observed, limit, dt, score)
            if event is not None:
                changed.append(event)

        return changed

    def _checks(
        self, state: AssetState, reading: Reading, limits: _Thresholds
    ) -> list[tuple[str, bool, float, float]]:
        """Every rule, as (type, is_breaching, observed, limit)."""
        offline = reading.device_status == "Offline"

        # A device that is not reporting has exactly one thing wrong with it.
        # Judging its zeroed electrical channels would raise a voltage-low event
        # on every drop-out, which is noise dressed up as detection.
        if offline:
            return [("communication-lost", True, 0.0, 0.0)]

        checks: list[tuple[str, bool, float, float]] = [
            ("communication-lost", False, 0.0, 0.0),
            ("voltage-high", reading.voltage > limits.voltage_high, reading.voltage, limits.voltage_high),
            ("voltage-low", reading.voltage < limits.voltage_low, reading.voltage, limits.voltage_low),
            ("current-spike", reading.current > limits.current_max, reading.current, limits.current_max),
            (
                "power-surge",
                reading.active_power > limits.power_max,
                reading.active_power,
                limits.power_max,
            ),
            (
                "temperature-high",
                reading.temperature > limits.temperature_max,
                reading.temperature,
                limits.temperature_max,
            ),
            (
                "frequency-deviation",
                abs(reading.frequency - limits.frequency_nominal) > limits.frequency_band,
                reading.frequency,
                limits.frequency_nominal,
            ),
        ]

        loaded = reading.active_power > state.profile.rated_power_w * PF_EVALUATION_FLOOR
        checks.append(
            (
                "power-factor-low",
                loaded and reading.power_factor < limits.power_factor_min,
                reading.power_factor,
                limits.power_factor_min,
            )
        )

        recent, baseline = self._energy_rates(state)
        checks.append(
            (
                "energy-spike",
                baseline > 0.0 and recent > baseline * 1.6,
                round(recent, 4),
                round(baseline * 1.6, 4),
            )
        )

        return checks

    @staticmethod
    def _energy_rates(state: AssetState) -> tuple[float, float]:
        """Recent and baseline consumption rate in kW, from the live window.

        Energy is cumulative, so the interesting quantity is its slope. Comparing
        the last few minutes with the device's own trailing window catches a unit
        that has quietly started consuming more for the same job, which no
        instantaneous power limit would notice.
        """
        history = state.history
        if len(history) < 120:
            return 0.0, 0.0

        samples = list(history)
        recent_window = samples[-60:]
        baseline_window = samples[:-60]

        def rate(window: list[Reading]) -> float:
            if len(window) < 2:
                return 0.0
            span_hours = (window[-1].ts - window[0].ts).total_seconds() / 3600.0
            if span_hours <= 0:
                return 0.0
            return (window[-1].energy_kwh - window[0].energy_kwh) / span_hours

        return rate(recent_window), rate(baseline_window)

    # ── State machine ───────────────────────────────────────────────────

    def _apply(
        self,
        state: AssetState,
        reading: Reading,
        anomaly_type: str,
        breaching: bool,
        observed: float,
        limit: float,
        dt: float,
        score: float,
    ) -> AnomalyEvent | None:
        definition = ANOMALY_DEFS[anomaly_type]
        tracker = self._breaches.setdefault(state.asset_id, {}).setdefault(anomaly_type, _Breach())

        if breaching:
            tracker.clear_seconds = 0.0
            tracker.breaching_seconds += dt
            tracker.peak_observed = (
                observed if tracker.open_uid is None else max(tracker.peak_observed, abs(observed))
            )

            if tracker.open_uid is None and tracker.breaching_seconds >= definition.confirm_seconds:
                return self._raise(state, reading, anomaly_type, observed, limit, score)
            return None

        tracker.breaching_seconds = 0.0

        if tracker.open_uid is None:
            return None

        # Require the reading to sit inside the limit with margin before the
        # event is allowed to clear, so a value hovering on the threshold does
        # not flap the journal.
        if not self._inside_margin(anomaly_type, observed, limit):
            tracker.clear_seconds = 0.0
            return None

        tracker.clear_seconds += dt
        if tracker.clear_seconds < definition.clear_seconds:
            return None

        return self._resolve(tracker, reading.ts)

    @staticmethod
    def _inside_margin(anomaly_type: str, observed: float, limit: float) -> bool:
        if anomaly_type == "communication-lost":
            return True
        if limit == 0:
            return True

        if anomaly_type in ("voltage-low", "power-factor-low"):
            return observed > limit * (1.0 + CLEAR_MARGIN)
        if anomaly_type == "frequency-deviation":
            return abs(observed - limit) < 0.8 * (1.0 - CLEAR_MARGIN)
        return observed < limit * (1.0 - CLEAR_MARGIN)

    def _raise(
        self,
        state: AssetState,
        reading: Reading,
        anomaly_type: str,
        observed: float,
        limit: float,
        score: float,
    ) -> AnomalyEvent:
        definition = ANOMALY_DEFS[anomaly_type]
        severity = anomaly_severity(anomaly_type, observed, limit)
        deviation = 0.0 if limit == 0 else abs(observed - limit) / abs(limit) * 100.0

        # The rule decides; the model corroborates. Agreement raises confidence,
        # and a model that has not seen enough of this device to have an opinion
        # neither helps nor hurts.
        if score >= 0.6:
            method, confidence = "hybrid", min(0.99, 0.72 + score * 0.25)
        elif score > 0.0:
            method, confidence = "rule+model", min(0.95, 0.68 + score * 0.2)
        else:
            method, confidence = "rule", 0.68

        event = AnomalyEvent(
            uid=f"ANO-{uuid.uuid4().hex[:12].upper()}",
            asset_id=state.asset_id,
            asset_name=state.seed.asset_name,
            category=state.seed.category,
            component=self._component_for(state, anomaly_type),
            error_code=definition.code,
            anomaly_type=anomaly_type,
            title=definition.title,
            severity=severity,
            status="Active",
            channel=definition.channel,
            observed_value=round(observed, 4),
            threshold_value=round(limit, 4),
            unit=definition.unit,
            deviation_pct=round(deviation, 3),
            anomaly_score=score,
            detection_method=method,
            confidence=round(confidence, 3),
            detail=anomaly_detail(anomaly_type, observed, limit, definition.unit, state.seed.asset_name),
            detected_at=reading.ts,
            response_target_minutes=RESPONSE_TARGET_MINUTES.get(severity, 60),
            mechanism=state.active_mechanism,
        )

        self.journal.append(event)
        self._by_uid[event.uid] = event
        self._breaches[state.asset_id][anomaly_type].open_uid = event.uid

        logger.info(
            "anomaly raised %s %s on %s (%.3f vs %.3f %s, severity=%s, score=%.2f)",
            event.error_code,
            event.title,
            event.asset_id,
            event.observed_value,
            event.threshold_value,
            event.unit,
            event.severity,
            event.anomaly_score,
        )
        return event

    def _close_unobservable(self, asset_id: str, when: datetime) -> list[AnomalyEvent]:
        """Clear every open event on a device that has stopped reporting.

        Communication loss is exempt — that one is the observation.
        """
        closed: list[AnomalyEvent] = []
        for anomaly_type, tracker in self._breaches.get(asset_id, {}).items():
            if anomaly_type == "communication-lost" or tracker.open_uid is None:
                continue
            tracker.breaching_seconds = 0.0
            event = self._resolve(tracker, when)
            if event is not None:
                closed.append(event)
        return closed

    def _resolve(self, tracker: _Breach, when: datetime) -> AnomalyEvent | None:
        uid = tracker.open_uid
        tracker.open_uid = None
        tracker.clear_seconds = 0.0
        tracker.peak_observed = 0.0

        event = self._by_uid.get(uid or "")
        if event is None:
            return None

        event.status = "Resolved"
        event.resolved_at = when
        event.dirty = True
        logger.info("anomaly cleared %s on %s", event.error_code, event.asset_id)
        return event

    @staticmethod
    def _component_for(state: AssetState, anomaly_type: str) -> str | None:
        """The part a fault of this kind implicates on this class of hardware.

        A first attribution, not a diagnosis — the root-cause layer weighs the
        evidence properly. It exists so an alert arrives already pointing at
        something serviceable.
        """
        names = {spec.name for spec in state.profile.components}

        preferences: dict[str, tuple[str, ...]] = {
            "temperature-high": ("Cooling System", "Thermal Sensor", "CPU", "Power Module"),
            "voltage-high": ("Power Adapter Port", "Transformer", "Power Module"),
            "voltage-low": ("Power Adapter Port", "Power Module", "Cable"),
            "current-spike": ("Battery", "Cable", "Protection Circuit"),
            "power-surge": ("CPU", "Power Module", "Transformer"),
            "power-factor-low": ("Power Module", "Transformer", "Power Adapter Port"),
            "frequency-deviation": ("Transformer", "Power Adapter Port"),
            "energy-spike": ("Battery", "Power Module", "CPU"),
            "communication-lost": ("Cable", "USB-C Output", "Power Adapter Port"),
        }

        for candidate in preferences.get(anomaly_type, ()):
            if candidate in names:
                return candidate
        return None

    # ── Journal access ──────────────────────────────────────────────────

    def acknowledge(self, uid: str, when: datetime, by: str = "operator") -> AnomalyEvent | None:
        event = self._by_uid.get(uid)
        if event is None or event.status != "Active":
            return None
        event.status = "Acknowledged"
        event.acknowledged_at = when
        event.dirty = True
        logger.info("anomaly acknowledged %s on %s by %s", event.error_code, event.asset_id, by)
        return event

    def acknowledge_all(self, when: datetime, by: str = "operator") -> list[AnomalyEvent]:
        claimed = [event for event in self.journal if event.status == "Active"]
        for event in claimed:
            event.status = "Acknowledged"
            event.acknowledged_at = when
            event.dirty = True
        if claimed:
            logger.info("batch acknowledged %d anomalies by %s", len(claimed), by)
        return claimed

    def open_events(self) -> list[AnomalyEvent]:
        return [event for event in self.journal if event.is_open]

    def active_by_asset(self, asset_id: str) -> list[AnomalyEvent]:
        return [event for event in self.journal if event.asset_id == asset_id and event.is_open]

    def since(self, when: datetime) -> list[AnomalyEvent]:
        return [event for event in self.journal if event.detected_at >= when]

    def count_last_24h(self, asset_id: str, now: datetime) -> int:
        cutoff = now - timedelta(hours=24)
        return sum(
            1 for event in self.journal if event.asset_id == asset_id and event.detected_at >= cutoff
        )

    def sorted_journal(self) -> list[AnomalyEvent]:
        return sorted(
            self.journal,
            key=lambda event: (SEVERITY_RANK.get(event.severity, 0), event.detected_at),
            reverse=True,
        )

    def unpersisted(self) -> list[AnomalyEvent]:
        return [event for event in self.journal if not event.persisted]

    def get(self, uid: str) -> AnomalyEvent | None:
        return self._by_uid.get(uid)

    def prune(self, keep: int = 5000) -> None:
        """Bound the in-memory journal. Persisted history stays in PostgreSQL."""
        if len(self.journal) <= keep:
            return
        removable = [event for event in self.journal if event.persisted and not event.is_open]
        drop = len(self.journal) - keep
        for event in removable[:drop]:
            self.journal.remove(event)
            self._by_uid.pop(event.uid, None)
