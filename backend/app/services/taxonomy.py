"""Failure taxonomy — M01 … M15.

The detector in `anomaly_service.py` decides *whether* an event is raised: nine
channel rules, each judged against the limits held on that device's own profile,
each with a dwell before it is reported and a clear margin before it is closed.
This module decides *what the event is called*.

The distinction matters. A channel rule is not a failure mode — an over-current
that clears in eight seconds is an inrush transient, and the identical rule held
for a minute is a genuine overcurrent fault with a thermal consequence. One rule,
two failure modes, two different responses.

Nothing here re-judges the detector. Every discriminator reads a field the
detector already published:

  · `deviation_pct` — how far past its own limit the reading sat, which is the
    same quantity `anomaly_severity` grades on (18% / 8% / 2.5%), so a rule that
    splits at 8% splits exactly where the platform's own boundary sits
  · how long the event stayed open, against the resolved timestamp
  · `component` — the serviceable part the detector attributed it to

Classification is deterministic: rules are evaluated in declaration order and
the first match owns the event, so the class counts always sum to the journal.

This ordering and these identifiers are the same taxonomy the anomaly view
renders. They are duplicated there so a filter can be drawn without waiting for
a request; this module is the authority.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from app.services.derive import ANOMALY_DEFS

# ── Fault categories ─────────────────────────────────────────────────────
#
# The stored code and the label an operator reads. `GRID_TRANSIENT` is stored
# rather than the shorter `GRID` so the value matches the `FaultClassId` union
# the frontend narrows on; `GRID` is accepted as a query alias.

ELECTRICAL = "ELECTRICAL"
THERMAL = "THERMAL"
DEGRADATION = "DEGRADATION"
COMMUNICATION = "COMMUNICATION"
MECHANICAL = "MECHANICAL"
GRID_TRANSIENT = "GRID_TRANSIENT"

CATEGORY_LABELS: dict[str, str] = {
    ELECTRICAL: "Electrical Faults",
    THERMAL: "Thermal Anomalies",
    DEGRADATION: "Degradation & Aging",
    GRID_TRANSIENT: "Grid Transients",
    COMMUNICATION: "Communication",
    MECHANICAL: "Mechanical",
}

CATEGORIES: tuple[str, ...] = tuple(CATEGORY_LABELS.keys())

#: Spellings a caller may pass for a category, mapped onto the stored code.
CATEGORY_ALIASES: dict[str, str] = {
    **{code: code for code in CATEGORIES},
    "GRID": GRID_TRANSIENT,
    "GRID_TRANSIENTS": GRID_TRANSIENT,
    "TRANSIENT": GRID_TRANSIENT,
}


def normalise_category(value: str | None) -> str | None:
    """Resolve a caller's category spelling. Returns None when unrecognised."""
    if value is None:
        return None
    return CATEGORY_ALIASES.get(value.strip().upper())


# ── Lifecycle and severity vocabulary ────────────────────────────────────

STATUS_ACTIVE = "ACTIVE"
STATUS_ACKNOWLEDGED = "ACKNOWLEDGED"
STATUS_SELF_CLEARED = "SELF_CLEARED"
STATUS_FALSE_POSITIVE = "FALSE_POSITIVE"

#: The detector's lifecycle, mapped onto the stored vocabulary. An event the
#: detector closed on its own cleared because the reading returned inside the
#: limit with margin and stayed there — it was not fixed by anyone, hence
#: `SELF_CLEARED`.
STATUS_FROM_DETECTOR: dict[str, str] = {
    "Active": STATUS_ACTIVE,
    "Acknowledged": STATUS_ACKNOWLEDGED,
    "Resolved": STATUS_SELF_CLEARED,
}

#: Severity is stored as the detector's own four bands, upper-cased.
#:
#: `MAJOR` is deliberately retained. The detector separates Critical (≥ 18% past
#: the limit) from Major (≥ 8%), and collapsing the two would erase the 8%
#: boundary — the line between "stressed" and "being damaged" on this hardware.
#: `SEVERITY_ROLLUP` is published for callers that only want three bands.
SEVERITY_FROM_DETECTOR: dict[str, str] = {
    "Critical": "CRITICAL",
    "Major": "MAJOR",
    "Warning": "WARNING",
    "Info": "INFO",
}

SEVERITY_ROLLUP: dict[str, str] = {
    "CRITICAL": "CRITICAL",
    "MAJOR": "CRITICAL",
    "WARNING": "WARNING",
    "INFO": "INFO",
}

# ── Discriminators ───────────────────────────────────────────────────────

#: An event that cleared inside a minute did not persist; it was a transient.
TRANSIENT_SECONDS = 60.0

#: Parts the detector attributes to airflow or actuation rather than electronics.
MECHANICAL_PARTS: frozenset[str] = frozenset({"Cooling System"})


def breach_ratio(event) -> float:
    """How far past its own limit the reading sat, as a fraction.

    Read from the `deviation_pct` the detector computed rather than recomputed
    from observed and threshold, so this cannot disagree with the severity the
    same event was graded with.
    """
    return float(event.deviation_pct) / 100.0


def open_seconds(event, now: datetime) -> float:
    end = event.resolved_at or now
    return max(0.0, (end - event.detected_at).total_seconds())


def is_transient(event, now: datetime) -> bool:
    return event.resolved_at is not None and open_seconds(event, now) <= TRANSIENT_SECONDS


def _mechanical_part(event) -> bool:
    return event.component is not None and event.component in MECHANICAL_PARTS


# ── Rules ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TaxonomyRule:
    """One failure mode."""

    #: Stable identifier, e.g. `M09_COOLING_FAILURE`. Operators quote these.
    type_id: str
    #: Short form, `M09`.
    code: str
    name: str
    category: str
    #: The signature as an engineer would name it.
    signature: str
    #: The condition, written as the detector applies it.
    expression: str
    #: Channel rules that can produce this failure mode.
    anomaly_types: tuple[str, ...]
    detail: str
    #: Applied after the channel-rule check. First rule to match owns the event.
    refine: Callable[[object, datetime], bool] | None = None

    @property
    def dwell_seconds(self) -> float:
        """Seconds the breach must persist before it is raised.

        Taken from the detector's own `confirm_seconds` for the underlying
        channel rule, so a latency figure quotes the running configuration
        rather than a second copy of it.
        """
        return ANOMALY_DEFS[self.anomaly_types[0]].confirm_seconds

    @property
    def clear_seconds(self) -> float:
        """Seconds the reading must sit back inside the limit before it clears."""
        return ANOMALY_DEFS[self.anomaly_types[0]].clear_seconds

    @property
    def channel(self) -> str:
        return ANOMALY_DEFS[self.anomaly_types[0]].channel


TAXONOMY_RULES: tuple[TaxonomyRule, ...] = (
    TaxonomyRule(
        type_id="M01_VOLTAGE_SURGE",
        code="M01",
        name="Voltage Surge",
        category=ELECTRICAL,
        signature="Voltage Surge",
        expression="V_rms > V_nom·(1 + tol) for >= 6 s, breach >= 8%",
        anomaly_types=("voltage-high",),
        detail=(
            "Sustained over-voltage at the input. The regulator holds the rail, but the stress is carried "
            "by the input stage and it shortens component life."
        ),
        refine=lambda event, now: breach_ratio(event) >= 0.08,
    ),
    TaxonomyRule(
        type_id="M02_VOLTAGE_SAG",
        code="M02",
        name="Voltage Sag",
        category=ELECTRICAL,
        signature="Voltage Sag",
        expression="V_rms < V_nom·(1 - tol) for >= 6 s, breach >= 8%",
        anomaly_types=("voltage-low",),
        detail=(
            "Sustained under-voltage. The device draws a higher current for the same delivered load, "
            "which pushes the thermal and current envelopes together."
        ),
        refine=lambda event, now: breach_ratio(event) >= 0.08,
    ),
    TaxonomyRule(
        type_id="M03_RAIL_FLICKER",
        code="M03",
        name="Rail Voltage Flicker",
        category=GRID_TRANSIENT,
        signature="Marginal Rail Excursion",
        expression="V_rms outside tolerance, breach < 8%",
        anomaly_types=("voltage-high", "voltage-low"),
        detail=(
            "A marginal excursion either side of the tolerance band. The magnitude points upstream of "
            "the device rather than at its own regulation."
        ),
    ),
    TaxonomyRule(
        type_id="M04_INRUSH_TRANSIENT",
        code="M04",
        name="Inrush Current Transient",
        category=ELECTRICAL,
        signature="Inrush Transient",
        expression="I_rms > I_max for >= 3 s, cleared within 60 s",
        anomaly_types=("current-spike",),
        detail=(
            "A short overcurrent that returned inside the limit under its own steam — the profile of a "
            "load step or a capacitor charging, not of a fault."
        ),
        refine=is_transient,
    ),
    TaxonomyRule(
        type_id="M05_OVERCURRENT",
        code="M05",
        name="Sustained Overcurrent",
        category=ELECTRICAL,
        signature="Overcurrent",
        expression="I_rms > I_max held beyond 60 s",
        anomaly_types=("current-spike",),
        detail=(
            "Current above the device rating that did not recover. Indicates a shorting load or failing "
            "regulation and carries a real thermal consequence."
        ),
    ),
    TaxonomyRule(
        type_id="M06_POWER_SURGE",
        code="M06",
        name="Active Power Surge",
        category=ELECTRICAL,
        signature="Power Surge",
        expression="P > 1.15 · P_rated for >= 4 s, breach >= 15%",
        anomaly_types=("power-surge",),
        detail="Active power well past the envelope for this device class — the load itself is out of specification.",
        refine=lambda event, now: breach_ratio(event) >= 0.15,
    ),
    TaxonomyRule(
        type_id="M07_HARMONIC_DISTORTION",
        code="M07",
        name="Harmonic Distortion Spike",
        category=ELECTRICAL,
        signature="Harmonic Distortion Spike",
        expression="P over envelope by < 15% with no proportional I_rms breach",
        anomaly_types=("power-surge",),
        detail=(
            "Power above the envelope without a matching current breach. The extra draw is distortion "
            "rather than useful load — the current waveform is no longer clean."
        ),
    ),
    TaxonomyRule(
        type_id="M08_POWER_FACTOR_DROP",
        code="M08",
        name="Power Factor Drop",
        category=ELECTRICAL,
        signature="Power Factor Drop",
        expression="PF < 0.62 for >= 20 s, evaluated above 10% load",
        anomaly_types=("power-factor-low",),
        detail=(
            "Displacement factor below the floor while the device is meaningfully loaded. Apparent power "
            "rises for the same useful work."
        ),
    ),
    TaxonomyRule(
        type_id="M09_COOLING_FAILURE",
        code="M09",
        name="Cooling System Failure",
        category=MECHANICAL,
        signature="Airflow Degradation",
        expression="T > T_max with the attribution resolving to the cooling assembly",
        anomaly_types=("temperature-high",),
        detail=(
            "The detector attributed the over-temperature to the cooling assembly. The electrical "
            "channels are inside their limits, so the heat is not being removed rather than being generated."
        ),
        refine=lambda event, now: _mechanical_part(event),
    ),
    TaxonomyRule(
        type_id="M10_THERMAL_RAMP",
        code="M10",
        name="Thermal Ramp",
        category=THERMAL,
        signature="Thermal Ramp",
        expression="T > T_max for >= 8 s, breach >= 18%",
        anomaly_types=("temperature-high",),
        detail=(
            "Temperature climbing well past the limit. Above this point throttling is already active and "
            "degradation accelerates non-linearly."
        ),
        refine=lambda event, now: breach_ratio(event) >= 0.18,
    ),
    TaxonomyRule(
        type_id="M11_OVER_TEMPERATURE",
        code="M11",
        name="Enclosure Over-temperature",
        category=THERMAL,
        signature="Over-temperature",
        expression="T > T_max for >= 8 s, breach < 18%",
        anomaly_types=("temperature-high",),
        detail="Steady operation above the thermal limit held on the device profile, without a runaway ramp.",
    ),
    TaxonomyRule(
        type_id="M12_CONSUMPTION_DRIFT",
        code="M12",
        name="Energy Consumption Drift",
        category=DEGRADATION,
        signature="Consumption Drift",
        expression="kWh rate > 1.6 x trailing baseline for >= 60 s, breach < 25%",
        anomaly_types=("energy-spike",),
        detail=(
            "The device is consuming more than its own recent baseline for the same job. No instantaneous "
            "limit would notice this."
        ),
        refine=lambda event, now: breach_ratio(event) < 0.25,
    ),
    TaxonomyRule(
        type_id="M13_MOSFET_LEAKAGE",
        code="M13",
        name="Leakage Signature",
        category=DEGRADATION,
        signature="MOSFET Leakage",
        expression="kWh rate > 1.6 x trailing baseline, breach >= 25%",
        anomaly_types=("energy-spike",),
        detail=(
            "Consumption far above the device's own baseline with the load unchanged — the profile of "
            "switching-stage leakage rather than of extra work."
        ),
    ),
    TaxonomyRule(
        type_id="M14_FREQUENCY_EXCURSION",
        code="M14",
        name="Grid Frequency Excursion",
        category=GRID_TRANSIENT,
        signature="Frequency Drift",
        expression="|f - f_nom| > 0.8 Hz for >= 10 s",
        anomaly_types=("frequency-deviation",),
        detail="Supply frequency outside the band. Nothing on the device causes this; the origin is upstream.",
    ),
    TaxonomyRule(
        type_id="M15_LINK_LOSS",
        code="M15",
        name="Telemetry Link Loss",
        category=COMMUNICATION,
        signature="Link Loss",
        expression="No packet for >= 3 s at a 1 Hz publication rate",
        anomaly_types=("communication-lost",),
        detail=(
            "The endpoint stopped publishing. Every other open event on the device is closed while this "
            "is raised, because the platform can no longer observe the limit it was asserting."
        ),
    ),
)

RULES_BY_TYPE_ID: dict[str, TaxonomyRule] = {rule.type_id: rule for rule in TAXONOMY_RULES}
RULES_BY_CODE: dict[str, TaxonomyRule] = {rule.code: rule for rule in TAXONOMY_RULES}

TYPE_IDS: tuple[str, ...] = tuple(rule.type_id for rule in TAXONOMY_RULES)


def resolve_type_id(value: str | None) -> str | None:
    """Accept either the full `M09_COOLING_FAILURE` or the short `M09`."""
    if value is None:
        return None
    candidate = value.strip().upper()
    if candidate in RULES_BY_TYPE_ID:
        return candidate
    rule = RULES_BY_CODE.get(candidate)
    return rule.type_id if rule else None


def classify(event, now: datetime) -> TaxonomyRule | None:
    """The failure mode behind one raised event.

    Returns None only if the detector ever raises a channel rule this taxonomy
    has not been extended for — which is the signal to extend it, not a
    condition to swallow silently.
    """
    for rule in TAXONOMY_RULES:
        if event.anomaly_type not in rule.anomaly_types:
            continue
        if rule.refine is not None and not rule.refine(event, now):
            continue
        return rule
    return None


# ── Telemetry snapshot ───────────────────────────────────────────────────
#
# Keys are the engineering names an operator reads on the anomaly view, not the
# simulator's attribute names, because this is stored verbatim and read back
# long after the reading it came from has been pruned.


def telemetry_snapshot(reading) -> dict[str, float | str]:
    """The 1 Hz sample the event was raised from, as stored on the event row."""
    return {
        "V_rms": round(reading.voltage, 3),
        "I_rms": round(reading.current, 4),
        "P_active": round(reading.active_power, 2),
        "P_apparent": round(reading.apparent_power, 2),
        "power_factor": round(reading.power_factor, 4),
        "frequency": round(reading.frequency, 3),
        "T_enc": round(reading.temperature, 2),
        "energy_kwh": round(reading.energy_kwh, 4),
        "health_score": round(reading.health_score, 2),
        "load_state": reading.load_state,
        "device_status": reading.device_status,
    }
