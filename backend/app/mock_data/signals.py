"""Deterministic signal generation.

Nothing here calls `random`. Every value is a pure function of (key, index), so
the same second of simulated time always produces the same reading whether it
is reached by running the engine forward or by back-filling history. That is
what makes the thirty days of stored history and the live stream one continuous
series rather than two unrelated datasets.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

_MASK32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _MASK32


def hash_seed(key: str) -> int:
    """FNV-style string hash, 32-bit."""
    h = (2166136261 ^ len(key)) & _MASK32
    for char in key:
        h = _imul(h ^ ord(char), 16777619)
        h = ((h << 13) | (h >> 19)) & _MASK32
    return (h ^ (h >> 16)) & _MASK32


_SEED_CACHE: dict[str, int] = {}


def _seed_for(key: str) -> int:
    cached = _SEED_CACHE.get(key)
    if cached is None:
        cached = hash_seed(key)
        _SEED_CACHE[key] = cached
    return cached


def _mix(seed: int, index: int) -> float:
    h = (seed ^ _imul(index + 0x9E3779B9, 0x85EBCA6B)) & _MASK32
    h = _imul(h ^ (h >> 15), 0xC2B2AE35)
    h = _imul(h ^ (h >> 13), 0x27D4EB2F)
    return ((h ^ (h >> 16)) & _MASK32) / 4294967296.0


def uniform(key: str, index: int) -> float:
    """Uniform sample in [0, 1) for a key and an integer index."""
    return _mix(_seed_for(key), index)


def normal(key: str, index: int) -> float:
    """Standard normal, clipped to ±3σ so one sample can never produce a jump."""
    u = max(_mix(_seed_for(key), index), 1e-9)
    v = _mix(_seed_for(key + "#b"), index)
    z = math.sqrt(-2.0 * math.log(u)) * math.cos(2.0 * math.pi * v)
    return max(-3.0, min(3.0, z))


def wander(key: str, index: int, period: float) -> float:
    """Smooth low-frequency drift in [-1, 1].

    Cosine-eased interpolation between hash points, so the curve has no corners.
    Used for the slow drivers — ambient temperature, supply quality — that ought
    to move over minutes rather than seconds.
    """
    scaled = index / period
    base = math.floor(scaled)
    frac = scaled - base
    a = _mix(_seed_for(key), int(base)) * 2.0 - 1.0
    b = _mix(_seed_for(key), int(base) + 1) * 2.0 - 1.0
    eased = (1.0 - math.cos(frac * math.pi)) / 2.0
    return a + (b - a) * eased


def ou_step(current: float, mean: float, theta: float, sigma: float, key: str, index: int) -> float:
    """One step of a mean-reverting (Ornstein–Uhlenbeck) process.

    `theta` is the pull toward the mean and `sigma` the per-step volatility.
    With sigma held to a small fraction of the nominal value, consecutive
    readings differ by fractions of a percent — the signature of a real sensor
    rather than a random number generator.
    """
    return current + theta * (mean - current) + sigma * normal(key, index)


def clamp(value: float, low: float, high: float) -> float:
    return low if value < low else high if value > high else value


def clamp01(value: float) -> float:
    return clamp(value, 0.0, 1.0)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * clamp01(t)


def approach(current: float, target: float, dt: float, tau: float) -> float:
    """First-order lag toward a target.

    The workhorse of the whole simulator: temperature, power and every other
    quantity with mass behind it moves this way. A step change in demand
    produces a curve, never a corner, and the curve is correct for any timestep,
    which is what lets the same code drive a one-second tick and an hourly
    back-fill step.
    """
    if tau <= 0.0:
        return target
    alpha = 1.0 - math.exp(-dt / tau)
    return current + (target - current) * alpha


# ── Fault injection ──────────────────────────────────────────────────────
#
# A real estate does not sit perfectly inside tolerance. A handful of units
# carry scheduled excursions so the detection, root-cause and maintenance
# modules have genuine events to work with. Because the schedule is a function
# of the asset id and the clock, the same fault happens at the same moment in
# every run — reproducible events, not coin flips.


@dataclass(frozen=True)
class ExcursionPlan:
    channel: str
    #: Seconds between the start of one occurrence and the next.
    period_s: float
    #: Offset of the first occurrence within the period.
    offset_s: float
    #: Length of the window.
    duration_s: float
    #: Peak multiplier applied at the centre of the window.
    magnitude: float
    #: Plain-language cause, surfaced by root-cause analysis as ground truth.
    mechanism: str


EXCURSION_PLANS: dict[str, tuple[ExcursionPlan, ...]] = {
    # Thermal runaway on a heavily loaded machine — the classic blocked-vent case.
    "LAP-003": (ExcursionPlan("temperature", 660.0, 90.0, 170.0, 1.34, "Cooling airflow restriction"),),
    # Intermittent dock seating: the supply drops out entirely for a few seconds.
    "LAP-005": (ExcursionPlan("link", 840.0, 220.0, 50.0, 0.0, "Connector seating"),),
    # Sustained heat soak on a mobile workstation under render load.
    "LAP-006": (ExcursionPlan("temperature", 780.0, 370.0, 200.0, 1.26, "Sustained load above thermal design"),),
    # Battery near end of life pulling inrush on every charge cycle.
    "LAP-008": (ExcursionPlan("current", 480.0, 110.0, 80.0, 1.58, "Battery cell degradation"),),
    # Failing adapter: output sags whenever the processor steps up.
    "LAP-011": (ExcursionPlan("voltage", 600.0, 290.0, 120.0, 0.87, "Adapter regulation failure"),),
    # Burst draw beyond the adapter's continuous envelope.
    "LAP-014": (ExcursionPlan("power", 570.0, 180.0, 100.0, 1.4, "Operation beyond duty envelope"),),
    # Failing regulator: output sags under load.
    "CHR-002": (ExcursionPlan("voltage", 480.0, 130.0, 150.0, 0.82, "Regulator failure under load"),),
    # Degrading rectifier overshooting on light load.
    "CHR-004": (ExcursionPlan("voltage", 720.0, 200.0, 130.0, 1.14, "Rectifier drift"),),
    # Cable damage raising current well past the rating.
    "CHR-006": (ExcursionPlan("current", 510.0, 330.0, 90.0, 1.66, "Cable fault"),),
    # Loose connector: the endpoint drops off the ingest stream.
    "CHR-008": (ExcursionPlan("link", 750.0, 460.0, 60.0, 0.0, "Connector continuity"),),
    # Compact adapter running hot in an enclosed space.
    "CHR-010": (ExcursionPlan("temperature", 690.0, 150.0, 160.0, 1.3, "Ambient heat accumulation"),),
}


@dataclass(frozen=True)
class Excursion:
    channel: str
    magnitude: float
    #: 0 at onset, 1 at the end of the window.
    progress: float
    #: Multiplier for this instant, eased in and out across the window.
    factor: float
    mechanism: str


def excursions_at(asset_id: str, elapsed_seconds: float) -> list[Excursion]:
    """Active excursions for an asset at a point on the clock."""
    plans = EXCURSION_PLANS.get(asset_id)
    if not plans:
        return []

    active: list[Excursion] = []
    for plan in plans:
        phase = (elapsed_seconds - plan.offset_s) % plan.period_s
        if phase < 0.0:
            phase += plan.period_s
        if phase >= plan.duration_s:
            continue

        progress = phase / plan.duration_s
        # Half-sine envelope: zero at both edges, peak at the centre. A real
        # fault develops and recedes; applying the magnitude as a step would put
        # a discontinuity in the channel.
        envelope = math.sin(progress * math.pi)

        active.append(
            Excursion(
                channel=plan.channel,
                magnitude=plan.magnitude,
                progress=progress,
                # A link is binary — a connection does not fade — so it keeps its
                # magnitude and the engine treats it as a state change.
                factor=plan.magnitude if plan.channel == "link" else 1.0 + (plan.magnitude - 1.0) * envelope,
                mechanism=plan.mechanism,
            )
        )
    return active


EXCURSION_ASSET_IDS: tuple[str, ...] = tuple(EXCURSION_PLANS.keys())
