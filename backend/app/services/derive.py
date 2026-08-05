"""Derivation layer — the platform's business logic.

Every health-dependent number the product reports is computed here and nowhere
else: health score, condition band, remaining useful life, failure probability,
maintenance priority, criticality weighting, risk tier, availability,
performance, quality and OEE. The React application computes none of them; it
renders what this module produced.

Component wear is the one piece of mutable state. It only ever increases, so
remaining useful life only ever decreases and failure probability only ever
rises, while health — being a function of wear — moves gradually in the opposite
direction. Because every module reads the same functions against the same wear,
two screens cannot disagree about the same device.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.mock_data.signals import clamp, clamp01

# ── Condition bands ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class BandDef:
    band: str
    label: str
    minimum: float
    color: str


#: 95+ Healthy · 80–94 Good · 65–79 Warning · below 65 Critical.
BANDS: tuple[BandDef, ...] = (
    BandDef("healthy", "Healthy", 95.0, "#0CA30C"),
    BandDef("good", "Good", 80.0, "#3D8EF0"),
    BandDef("warning", "Warning", 65.0, "#FAB219"),
    BandDef("critical", "Critical", 0.0, "#D03B3B"),
)


def band_of(health: float) -> str:
    if health >= 95.0:
        return "healthy"
    if health >= 80.0:
        return "good"
    if health >= 65.0:
        return "warning"
    return "critical"


def band_def(band: str) -> BandDef:
    for entry in BANDS:
        if entry.band == band:
            return entry
    return BANDS[-1]


# ── Health from wear ─────────────────────────────────────────────────────


def asset_wear(component_wear: list[float] | tuple[float, ...]) -> float:
    """Asset-level wear.

    The weakest component weighted against the average one, so a single failing
    part drags the asset down without five healthy parts masking it.
    """
    if not component_wear:
        return 0.0
    worst = max(component_wear)
    mean = sum(component_wear) / len(component_wear)
    return clamp01(worst * 0.62 + mean * 0.38)


def health_from_wear(wear: float, transient_penalty: float = 0.0) -> float:
    """Health score from wear, less any live electrical or thermal penalty.

    The exponent makes the curve convex: the first twenty wear points cost
    little health and the last twenty cost a great deal, which is the shape real
    degradation follows.
    """
    return round(clamp(100.0 - 82.0 * (clamp01(wear) ** 1.18) - transient_penalty, 3.0, 100.0), 1)


# ── Predictive maintenance ───────────────────────────────────────────────

PREDICTION_HORIZON_DAYS = 30


def rul_days_from_wear(wear: float, wear_per_day: float) -> float:
    """Remaining useful life: distance to the failure boundary over the wear rate."""
    remaining = max(0.0, 1.0 - clamp01(wear))
    if wear_per_day <= 0.0:
        return 3650.0
    days = remaining / wear_per_day
    return round(clamp(days, 0.0, 3650.0), 1 if days < 10 else 0)


def failure_probability(
    wear: float, wear_per_day: float, horizon_days: int = PREDICTION_HORIZON_DAYS
) -> float:
    """Probability of crossing the failure boundary inside the horizon.

    A logistic on projected wear, so the curve rises gradually rather than
    stepping the moment a threshold is passed.
    """
    projected = clamp01(wear) + wear_per_day * horizon_days
    return round(clamp01(1.0 / (1.0 + math.exp(-9.0 * (projected - 0.92)))), 4)


def prediction_confidence(probability: float, observed_samples: int) -> float:
    """Confidence is highest far from the decision boundary, and grows with history."""
    decisiveness = abs(probability - 0.5) * 2.0
    history_bonus = clamp(observed_samples / 40000.0, 0.0, 0.07)
    return round(clamp(0.70 + 0.24 * decisiveness + history_bonus, 0.6, 0.99), 3)


_REPLACE_PATTERN = ("battery", "cable", "usb-c output", "power adapter port", "ssd", "ram")
_SERVICE_PATTERN = ("cooling system", "thermal sensor", "protection circuit")


def recommendation_for(component: str, probability: float, rul_days: float) -> str:
    """Component-specific remedy text, keyed off the part and how long it has left."""
    lower = component.lower()

    if probability < 0.15:
        return f"No action required — {lower} within normal wear"
    if probability < 0.40:
        return f"Inspect {lower} at next scheduled service"

    if rul_days <= 3:
        within = "immediately"
    elif rul_days <= 14:
        weeks = max(1, round(rul_days / 7))
        within = f"within {weeks} week{'' if weeks == 1 else 's'}"
    else:
        months = max(1, round(rul_days / 30))
        within = f"within {months} month{'' if months == 1 else 's'}"

    if lower in _SERVICE_PATTERN:
        verb = "Service"
    elif lower in _REPLACE_PATTERN:
        verb = "Replace"
    else:
        verb = "Replace"

    return f"{verb} {lower} {within}"


CRITICALITY_WEIGHT: dict[str, float] = {"High": 1.35, "Medium": 1.0, "Low": 0.75}


def maintenance_priority(
    band: str, rul_days: float, probability: float, criticality: str = "Medium"
) -> str:
    """Work priority.

    Condition and remaining life set the base, and business criticality moves it:
    the same failure probability on a high-criticality unit outranks it on a
    low-criticality one, which is the whole reason criticality is recorded.
    """
    weight = CRITICALITY_WEIGHT.get(criticality, 1.0)
    score = (probability * 60.0 + (1.0 - clamp01(rul_days / 365.0)) * 40.0) * weight

    if band == "critical" or score >= 68.0:
        return "Critical"
    if band == "warning" or score >= 45.0:
        return "High"
    if score >= 24.0:
        return "Medium"
    return "Low"


PRIORITY_RANK: dict[str, int] = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


# ── Power triangle ───────────────────────────────────────────────────────


def apparent_power(voltage: float, current: float) -> float:
    """S = V·I. Derived, never stored independently, so it cannot disagree with
    the voltage and current in the same reading."""
    return round(voltage * current, 2)


def reactive_power(voltage: float, current: float, power_factor: float) -> float:
    """Q = S·√(1−PF²). Falls out of the same three measured quantities as active
    power, so the triangle always closes."""
    s = voltage * current
    pf = clamp(power_factor, 0.0, 1.0)
    return round(s * math.sqrt(max(0.0, 1.0 - pf * pf)), 2)


def relay_state(device_status: str) -> str:
    """Supply relay position. A device that is not reporting has an open relay."""
    return "Open" if device_status == "Offline" else "Closed"


# ── Executive composites ─────────────────────────────────────────────────


def operational_health_score(
    mean_health: float,
    availability_pct: float,
    critical_assets: int,
    critical_anomalies: int,
    total_assets: int,
) -> float:
    """The single executive number for the whole estate.

    Condition dominates, availability carries real weight because an unreachable
    device is an unmanaged one, and open critical alerts apply a bounded penalty
    so a quiet fleet with an unattended alarm never reads as fully healthy.
    """
    if total_assets == 0:
        return 0.0
    condition = clamp(mean_health, 0.0, 100.0) * 0.62
    availability = clamp(availability_pct, 0.0, 100.0) * 0.26
    coverage = (1.0 - clamp01(critical_assets / total_assets)) * 100.0 * 0.12
    alarm_penalty = min(6.0, critical_anomalies * 1.5)
    return round(clamp(condition + availability + coverage - alarm_penalty, 0.0, 100.0), 1)


RISK_TIERS: tuple[str, ...] = ("critical", "high", "medium", "low", "healthy")


def risk_tier_of(band: str, probability: float, active_critical: int, offline: bool) -> str:
    """Risk blends condition, projected failure probability and alarm state.

    An offline device is never rated better than medium: its condition cannot be
    observed, and unknown is not the same as good.
    """
    if band == "critical" or active_critical > 0:
        return "critical"
    if offline:
        return "high" if probability > 0.4 else "medium"
    if band == "warning" or probability > 0.55:
        return "high"
    if probability > 0.28:
        return "medium"
    if band == "good":
        return "low"
    return "healthy"


# ── Performance and effectiveness ────────────────────────────────────────


def performance_from_health(health: float, temperature_ratio: float, category: str = "Laptop") -> float:
    """Throughput against nominal capability.

    A degraded or thermally throttled asset does less work per unit of time.
    Throttling begins once the device passes about 85% of its thermal ceiling.
    """
    if category == "Mobile Charger":
        # A charger's performance is strictly tied to its thermal throttling and efficiency.
        # It doesn't have mechanical condition degradation like manufacturing OEE.
        throttle = 1.0 - (temperature_ratio - 0.85) * 1.1 if temperature_ratio > 0.85 else 1.0
        return round(clamp(clamp(throttle, 0.62, 1.0) * 100.0, 60.0, 100.0), 1)
        
    condition = 0.6 + 0.4 * (health / 100.0)
    throttle = 1.0 - (temperature_ratio - 0.85) * 1.1 if temperature_ratio > 0.85 else 1.0
    return round(clamp(condition * clamp(throttle, 0.62, 1.0) * 100.0, 30.0, 100.0), 1)


def quality_from_health(health: float, anomalies_24h: int, category: str = "Laptop") -> float:
    """First-pass success, degraded by condition and by recent anomaly load."""
    if category == "Mobile Charger":
        # Chargers do not produce "defective" watts. Quality is always 100%.
        return 100.0

    condition = 0.955 + 0.045 * (health / 100.0)
    penalty = clamp(anomalies_24h * 0.006, 0.0, 0.09)
    return round(clamp((condition - penalty) * 100.0, 80.0, 100.0), 1)


def availability_from_uptime(uptime_ratio: float, category: str = "Laptop") -> float:
    """Availability is measured uptime, not a function of health."""
    return round(clamp(uptime_ratio * 100.0, 0.0, 100.0), 1)


def oee_of(availability: float, performance: float, quality: float) -> float:
    return round((availability / 100.0) * (performance / 100.0) * (quality / 100.0) * 100.0, 1)


OEE_TARGET = 85.0
OEE_WORLD_CLASS = 92.0


def effectiveness_losses(availability: float, performance: float, quality: float) -> list[dict]:
    """Decompose the gap from a theoretical 100% down to actual effectiveness.

    Each arm is the measured shortfall of its own factor scaled by the factors
    before it, so the cascade sums to the real gap rather than to an assumed
    distribution.
    """
    availability_loss = 100.0 - availability
    performance_loss = (100.0 - performance) * (availability / 100.0)
    quality_loss = (100.0 - quality) * (availability / 100.0) * (performance / 100.0)

    return [
        {
            "key": "availability",
            "label": "Availability loss",
            "loss": round(availability_loss, 2),
            "detail": "Time the device was unreachable or in standby rather than working",
        },
        {
            "key": "performance",
            "label": "Performance loss",
            "loss": round(performance_loss, 2),
            "detail": "Reduced throughput from degraded condition and thermal throttling",
        },
        {
            "key": "quality",
            "label": "Quality loss",
            "loss": round(quality_loss, 2),
            "detail": "First-pass shortfall attributable to condition and anomaly load",
        },
    ]


# ── Anomaly definitions ──────────────────────────────────────────────────


@dataclass(frozen=True)
class AnomalyDef:
    anomaly_type: str
    code: str
    title: str
    unit: str
    channel: str
    #: Seconds a breach must persist before the event is raised.
    confirm_seconds: float
    #: Seconds the reading must sit back inside the limit before it clears.
    clear_seconds: float


#: Fixed error codes. Operators memorise these, so they are stable identifiers
#: rather than generated values.
ANOMALY_DEFS: dict[str, AnomalyDef] = {
    "voltage-high": AnomalyDef("voltage-high", "ANO-1001", "Voltage High", "V", "voltage", 6.0, 12.0),
    "voltage-low": AnomalyDef("voltage-low", "ANO-1002", "Voltage Low", "V", "voltage", 6.0, 12.0),
    "current-spike": AnomalyDef("current-spike", "ANO-1003", "Current Spike", "A", "current", 3.0, 8.0),
    "power-surge": AnomalyDef("power-surge", "ANO-1004", "Power Surge", "W", "active_power", 4.0, 10.0),
    "power-factor-low": AnomalyDef(
        "power-factor-low", "ANO-1005", "Power Factor Low", "", "power_factor", 20.0, 30.0
    ),
    "temperature-high": AnomalyDef(
        "temperature-high", "ANO-1006", "Temperature Exceeded", "°C", "temperature", 8.0, 20.0
    ),
    "frequency-deviation": AnomalyDef(
        "frequency-deviation", "ANO-1007", "Frequency Deviation", "Hz", "frequency", 10.0, 15.0
    ),
    "energy-spike": AnomalyDef("energy-spike", "ANO-1008", "Energy Consumption Spike", "kWh", "energy_kwh", 60.0, 60.0),
    "communication-lost": AnomalyDef(
        "communication-lost", "ANO-1009", "Communication Lost", "", "device_status", 3.0, 3.0
    ),
}

ANOMALY_TYPES: tuple[str, ...] = tuple(ANOMALY_DEFS.keys())

SEVERITY_RANK: dict[str, int] = {"Critical": 4, "Major": 3, "Warning": 2, "Info": 1}


def anomaly_severity(anomaly_type: str, observed: float, threshold: float) -> str:
    """Severity from how far past the limit the reading sits.

    A link loss is always critical; everything else escalates with the size of
    the breach against that device's own limit, which keeps the comparison fair
    between a 35 W charger and a 96 W laptop.
    """
    if anomaly_type == "communication-lost":
        return "Critical"
    if threshold == 0:
        return "Warning"

    overshoot = abs(observed - threshold) / abs(threshold)
    if overshoot >= 0.18:
        return "Critical"
    if overshoot >= 0.08:
        return "Major"
    if overshoot >= 0.025:
        return "Warning"
    return "Info"


def anomaly_detail(anomaly_type: str, observed: float, threshold: float, unit: str, asset_name: str) -> str:
    def fmt(value: float) -> str:
        return f"{value:.3f}" if unit == "A" else f"{value:.2f}"

    if anomaly_type == "voltage-high":
        return (
            f"Input voltage reached {fmt(observed)} {unit} against an upper limit of {fmt(threshold)} {unit}. "
            "Sustained over-voltage stresses the regulator and shortens component life."
        )
    if anomaly_type == "voltage-low":
        return (
            f"Input voltage fell to {fmt(observed)} {unit} against a lower limit of {fmt(threshold)} {unit}. "
            "Under-voltage forces a higher current draw for the same delivered load."
        )
    if anomaly_type == "current-spike":
        return (
            f"Current draw reached {fmt(observed)} {unit} against a rated ceiling of {fmt(threshold)} {unit}. "
            "Repeated spikes indicate a shorting load or failing regulation."
        )
    if anomaly_type == "power-surge":
        return (
            f"Active power reached {fmt(observed)} {unit} against an expected ceiling of {fmt(threshold)} {unit} "
            "for this device class."
        )
    if anomaly_type == "power-factor-low":
        return (
            f"Power factor fell to {fmt(observed)} against a floor of {fmt(threshold)}. "
            "A poor displacement factor raises apparent power for the same useful work."
        )
    if anomaly_type == "temperature-high":
        return (
            f"Internal temperature reached {fmt(observed)} {unit} against a limit of {fmt(threshold)} {unit}. "
            "Thermal throttling is active and degradation accelerates above this point."
        )
    if anomaly_type == "frequency-deviation":
        return (
            f"Supply frequency measured {fmt(observed)} {unit} against a nominal {fmt(threshold)} {unit}. "
            "Deviation at the input points upstream of the device."
        )
    if anomaly_type == "energy-spike":
        return (
            f"Energy accumulated at {fmt(observed)} {unit} over the comparison window against an expected "
            f"{fmt(threshold)} {unit} for this device's recent behaviour."
        )
    if anomaly_type == "communication-lost":
        return (
            f"{asset_name} stopped reporting telemetry. No samples were received within the ingest window; "
            "the device is unreachable and its condition cannot be assessed."
        )
    return f"{asset_name} breached an operating threshold."


#: Minutes from raise to acknowledgement allowed for each severity.
RESPONSE_TARGET_MINUTES: dict[str, int] = {"Critical": 5, "Major": 15, "Warning": 60, "Info": 240}


# ── Prescriptive actions ─────────────────────────────────────────────────


def prescriptive_for(
    band: str, weakest_component: str, status: str, temperature_ratio: float
) -> dict[str, str]:
    """Business recommendation from condition and the weakest component.

    Deliberately free of telemetry and analytics — this layer answers what should
    be done, not what is happening.
    """
    lower = weakest_component.lower()

    if status == "Offline":
        return {
            "urgency": "Immediate",
            "action": "Restore device connectivity",
            "rationale": (
                "The device is unreachable, so its condition cannot be assessed and any developing fault is "
                "invisible until the link returns."
            ),
        }

    if band == "critical":
        if "battery" in lower:
            return {
                "urgency": "Immediate",
                "action": f"Replace {lower}",
                "rationale": (
                    "Condition is critical and the battery is the limiting component. Replacement is cheaper "
                    "than the unplanned outage it prevents."
                ),
            }
        if temperature_ratio > 0.9:
            return {
                "urgency": "Immediate",
                "action": "Reduce load and withdraw for service",
                "rationale": (
                    "The device is critical and running near its thermal ceiling. Continued operation "
                    "accelerates damage to every component inside it."
                ),
            }
        return {
            "urgency": "Immediate",
            "action": "Schedule maintenance without delay",
            "rationale": (
                f"Condition is critical with {lower} as the limiting component. The asset should not be left "
                "in service unattended."
            ),
        }

    if band == "warning":
        if temperature_ratio > 0.82:
            return {
                "urgency": "Scheduled",
                "action": "Clean cooling vents and verify airflow",
                "rationale": (
                    "Temperature is elevated relative to this device class. Restoring airflow is the "
                    "lowest-cost intervention and slows further degradation."
                ),
            }
        if any(token in lower for token in ("cable", "adapter", "usb-c", "power module", "transformer")):
            return {
                "urgency": "Scheduled",
                "action": f"Inspect {lower}",
                "rationale": (
                    "Supply-side components show the most wear. Inspection at the next service window "
                    "prevents an in-service failure."
                ),
            }
        return {
            "urgency": "Monitor",
            "action": f"Monitor {lower} condition",
            "rationale": (
                "The device is serviceable but trending down. Continued observation confirms whether "
                "degradation is accelerating before work is committed."
            ),
        }

    if band == "good":
        return {
            "urgency": "Monitor",
            "action": "Continue routine monitoring",
            "rationale": "Condition is good and within expected wear for the asset age. No intervention is justified yet.",
        }

    return {
        "urgency": "None",
        "action": "No action required",
        "rationale": "Device operating normally within every limit.",
    }
