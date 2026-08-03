"""MIKOS Smart Energy Sensor simulation.

No hardware exists, so this module stands in for it. What it does not do is
invent numbers: every reading is produced by a small physical model of the
device, and the fourteen published parameters are related to one another exactly
as they would be on a real meter.

    active power  ← demanded by the operating mode, reached through a first-order lag
    voltage       ← nominal, less the sag its own current causes across the supply
    current       ← P / (V · PF), so the three can never disagree
    apparent      ← V · I
    reactive      ← √(S² − P²)
    energy        ← the running integral of active power
    temperature   ← a thermal mass warming toward ambient + rise · load
    wear          ← accrued from heat, load and switching, and never reversed
    health        ← a function of wear, so it moves only as wear moves

The consequence is that the stories in the specification fall out of the model
rather than being scripted. A laptop entering Charging raises its demand, so
current climbs, so power climbs, so the thermal target rises and temperature
follows it over the next few minutes, so energy accumulates faster, so wear
accrues faster, so health drifts down. Nothing coordinates that sequence; it is
what the equations do.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.mock_data.catalog import (
    ASSET_SEEDS,
    AssetSeed,
    CategoryProfile,
    device_uid_for,
    profile_for,
)
from app.mock_data.signals import (
    Excursion,
    approach,
    clamp,
    clamp01,
    excursions_at,
    ou_step,
    uniform,
    wander,
)
from app.services.derive import (
    apparent_power,
    asset_wear,
    band_of,
    health_from_wear,
    reactive_power,
    relay_state,
)

SECONDS_PER_DAY = 86_400.0


@dataclass
class Reading:
    """One MIKOS sample: the fourteen published parameters plus what was derived."""

    asset_id: str
    device_uid: str
    ts: datetime

    voltage: float
    current: float
    active_power: float
    apparent_power: float
    reactive_power: float
    power_factor: float
    frequency: float
    energy_kwh: float
    runtime_hours: float
    temperature: float
    relay_status: str
    relay_operations: int
    device_status: str

    health_score: float
    load_state: str
    resolution: str = "second"

    def as_row(self) -> dict:
        """Mapping for a bulk insert into `telemetry`."""
        return {
            "asset_id": self.asset_id,
            "device_uid": self.device_uid,
            "ts": self.ts,
            "resolution": self.resolution,
            "voltage": self.voltage,
            "current": self.current,
            "active_power": self.active_power,
            "apparent_power": self.apparent_power,
            "reactive_power": self.reactive_power,
            "power_factor": self.power_factor,
            "frequency": self.frequency,
            "energy_kwh": self.energy_kwh,
            "runtime_hours": self.runtime_hours,
            "temperature": self.temperature,
            "relay_status": self.relay_status,
            "relay_operations": self.relay_operations,
            "device_status": self.device_status,
            "health_score": self.health_score,
            "load_state": self.load_state,
        }


@dataclass
class AssetState:
    """Everything the simulator remembers about one device between ticks."""

    seed: AssetSeed
    profile: CategoryProfile
    device_uid: str

    ts: datetime
    elapsed_seconds: float = 0.0
    tick: int = 0

    load_state: str = "Idle"
    state_ends_at: float = 0.0
    transition_index: int = 0

    voltage: float = 0.0
    current: float = 0.0
    active_power: float = 0.0
    #: Smoothed power the operating mode is asking for, kept separate from the
    #: published active power. The published figure is recomputed from measured
    #: voltage and current every tick; feeding it back into the demand would
    #: close a loop between sag and draw that has no counterpart in hardware.
    demand_power: float = 0.0
    power_factor: float = 0.9
    frequency: float = 50.0
    energy_kwh: float = 0.0
    runtime_hours: float = 0.0
    temperature: float = 25.0

    relay_status: str = "Closed"
    relay_operations: int = 0
    device_status: str = "Online"

    wear: list[float] = field(default_factory=list)
    #: Smoothed wear accrual per component, in wear-fraction per day. The
    #: instantaneous rate swings with every change of operating mode, and a
    #: remaining-life figure computed from it would swing with it; the predictive
    #: layer reads this instead.
    wear_rate: list[float] = field(default_factory=list)
    health: float = 100.0

    online_seconds: float = 0.0
    observed_seconds: float = 0.0
    #: Cause of the excursion currently distorting this device, when there is one.
    active_mechanism: str | None = None

    history: deque[Reading] = field(default_factory=lambda: deque(maxlen=settings.live_window_samples))

    @property
    def asset_id(self) -> str:
        return self.seed.asset_id

    @property
    def uptime_ratio(self) -> float:
        if self.observed_seconds <= 0.0:
            return 1.0
        return clamp01(self.online_seconds / self.observed_seconds)

    @property
    def temperature_ratio(self) -> float:
        ceiling = self.profile.max_temperature_c
        return clamp01(self.temperature / ceiling) if ceiling > 0 else 0.0

    @property
    def load_ratio(self) -> float:
        rated = self.profile.rated_power_w
        return clamp01(self.active_power / rated) if rated > 0 else 0.0

    @property
    def components(self) -> list[str]:
        return [spec.name for spec in self.profile.components]

    @property
    def band(self) -> str:
        return band_of(self.health)


class MikosSimulator:
    """The mock sensor estate.

    Holds one `AssetState` per commissioned device and advances all of them by a
    timestep. The same `step` serves the live one-second tick and the coarse
    steps used to back-fill history, because every quantity that has mass behind
    it is integrated against `dt` rather than against a tick count.
    """

    def __init__(self, start: datetime | None = None) -> None:
        self.started_at: datetime = start or datetime.now(timezone.utc)
        self.states: dict[str, AssetState] = {}
        for seed in ASSET_SEEDS:
            self.states[seed.asset_id] = self._build_state(seed, self.started_at)

    def add_asset(self, seed: AssetSeed) -> AssetState:
        state = self._build_state(seed, datetime.now(timezone.utc))
        self.states[seed.asset_id] = state
        return state

    # ── Construction ────────────────────────────────────────────────────

    @staticmethod
    def _build_state(seed: AssetSeed, start: datetime) -> AssetState:
        profile = profile_for(seed)
        initial = profile.initial_state
        state = AssetState(
            seed=seed,
            profile=profile,
            device_uid=device_uid_for(seed.asset_id),
            ts=start,
            load_state=initial,
            voltage=profile.nominal_voltage,
            frequency=profile.nominal_frequency,
            temperature=profile.ambient_temperature_c,
            power_factor=profile.states[initial].power_factor,
            wear=[
                clamp01(seed.initial_wear[index] if index < len(seed.initial_wear) else 0.05)
                for index in range(len(profile.components))
            ],
            wear_rate=[spec.base_wear_per_day * seed.duty_factor for spec in profile.components],
        )

        # Settle the device at its opening operating point rather than starting
        # everything from zero, which would put a ramp on the first reading of
        # every channel.
        opening = profile.states[initial]
        state.demand_power = profile.rated_power_w * opening.load_factor
        state.active_power = state.demand_power
        state.temperature = profile.ambient_temperature_c + profile.thermal_rise_c * opening.load_factor * 0.85
        state.device_status = opening.device_status
        state.relay_status = relay_state(opening.device_status)
        state.state_ends_at = MikosSimulator._dwell_for(state, initial)
        state.health = health_from_wear(asset_wear(state.wear))
        return state

    @staticmethod
    def _dwell_for(state: AssetState, name: str) -> float:
        """How long this unit stays in a mode, drawn deterministically per asset."""
        low, high = state.profile.states[name].dwell_seconds
        roll = uniform(f"{state.asset_id}|dwell|{name}", state.transition_index)
        return state.elapsed_seconds + low + (high - low) * roll

    @staticmethod
    def _next_state(state: AssetState) -> str:
        """Pick the next operating mode from the transition weights."""
        options = state.profile.states[state.load_state].transitions
        total = sum(weight for _, weight in options)
        roll = uniform(f"{state.asset_id}|transition", state.transition_index) * total

        cumulative = 0.0
        for name, weight in options:
            cumulative += weight
            if roll <= cumulative:
                return name
        return options[-1][0]

    # ── Stepping ────────────────────────────────────────────────────────

    def step(self, dt: float, *, wear_scale: float | None = None, resolution: str = "second") -> list[Reading]:
        """Advance every device by `dt` seconds and return this step's readings."""
        scale = settings.wear_time_scale if wear_scale is None else wear_scale
        return [self.step_asset(state, dt, scale, resolution) for state in self.states.values()]

    def step_asset(self, state: AssetState, dt: float, wear_scale: float, resolution: str) -> Reading:
        profile = state.profile
        state.tick += 1
        state.elapsed_seconds += dt
        state.ts = state.ts + timedelta(seconds=dt)
        index = int(state.elapsed_seconds)

        excursions = {item.channel: item for item in excursions_at(state.asset_id, state.elapsed_seconds)}
        state.active_mechanism = next((item.mechanism for item in excursions.values()), None)

        link = excursions.get("link")
        if link is not None:
            # The endpoint has dropped off the stream. Nothing electrical is
            # published while it is gone, and its relay is open.
            self._go_offline(state, dt)
            return self._emit(state, resolution)

        was_offline = state.device_status == "Offline"
        self._advance_mode(state)

        mode = profile.states[state.load_state]
        state.device_status = mode.device_status

        # ── Demand ──────────────────────────────────────────────────────
        # Load wanders slowly inside the mode: a machine in Active is not doing
        # exactly the same work from second to second.
        drift = wander(f"{state.asset_id}|load", index, 90.0) * 0.07
        load_factor = clamp(mode.load_factor * (1.0 + drift), 0.0, 1.3)

        target_power = profile.rated_power_w * load_factor
        surge = excursions.get("power")
        if surge is not None:
            target_power *= surge.factor

        # Electrical demand settles far faster than temperature, but not
        # instantly — a charge controller ramps.
        power_tau = 9.0 if profile.category == "Laptop" else 5.0
        state.demand_power = max(0.0, approach(state.demand_power, target_power, dt, power_tau))

        # ── Power factor ────────────────────────────────────────────────
        # Falls away at light load, as a switch-mode supply's does, and degrades
        # slightly as the conversion stage wears.
        conversion_wear = self._wear_of(state, ("Power Module", "Transformer", "Power Adapter Port", "Battery"))
        pf_target = clamp(mode.power_factor - 0.05 * conversion_wear, 0.35, 0.99)
        state.power_factor = clamp(approach(state.power_factor, pf_target, dt, 18.0), 0.3, 0.99)

        # ── Voltage ─────────────────────────────────────────────────────
        # Nominal, less the sag this device's own current causes across the
        # supply impedance, plus slow drift and sensor noise.
        supply_drift = wander(f"{state.asset_id}|supply", index, 240.0) * 0.006
        sag = profile.supply_impedance * state.current
        voltage_target = profile.nominal_voltage * (1.0 + supply_drift) - sag

        dip = excursions.get("voltage")
        if dip is not None:
            voltage_target *= dip.factor

        # A supply that has sagged this far has tripped rather than continued to
        # deliver. The fault model here is a sag, not a collapse, so the floor
        # bounds it — without one, a deep sag drives the current solution below
        # toward infinity.
        voltage_target = max(voltage_target, profile.nominal_voltage * 0.55)

        if was_offline:
            # Coming back from a drop-out, snap to the operating point instead of
            # ramping from zero — reconnecting is not a slew.
            state.voltage = voltage_target
        else:
            state.voltage = approach(state.voltage, voltage_target, dt, 3.0)
        state.voltage = ou_step(state.voltage, state.voltage, 0.0, 0.012, f"{state.asset_id}|vnoise", index)
        state.voltage = max(0.1, state.voltage)

        # ── Current, and the triangle that follows from it ──────────────
        # Drawn from the smoothed demand, never from the previous tick's
        # published power: the published figure already contains this tick's
        # voltage, and reusing it would let sag and draw drive each other.
        denominator = max(0.05, state.voltage * state.power_factor)
        current = state.demand_power / denominator

        spike = excursions.get("current")
        if spike is not None:
            current *= spike.factor

        # Every supply in this estate current-limits. Without a ceiling a cable
        # fault would publish hundreds of amps through a 65 W adapter.
        state.current = clamp(current, 0.0, profile.max_current_a * 2.2)

        # Active power is recomputed from the three measured quantities so the
        # published set is internally consistent even when a fault has driven
        # current away from what demand alone would produce.
        state.active_power = state.voltage * state.current * state.power_factor

        # ── Frequency ───────────────────────────────────────────────────
        state.frequency = clamp(
            ou_step(state.frequency, profile.nominal_frequency, 0.08, 0.006, f"{state.asset_id}|freq", index),
            profile.nominal_frequency - 1.2,
            profile.nominal_frequency + 1.2,
        )

        # ── Accumulators ────────────────────────────────────────────────
        state.energy_kwh += (state.active_power / 1000.0) * (dt / 3600.0)
        state.runtime_hours += dt / 3600.0

        # ── Temperature ─────────────────────────────────────────────────
        # A thermal mass chasing ambient plus the rise its own dissipation
        # produces. Worn cooling raises the target it settles at.
        cooling_wear = self._wear_of(state, ("Cooling System", "Thermal Sensor"))
        ambient = profile.ambient_temperature_c + wander(f"{state.asset_id}|ambient", index, 900.0) * 2.2
        thermal_target = ambient + profile.thermal_rise_c * state.load_ratio * (1.0 + 0.35 * cooling_wear)

        heat = excursions.get("temperature")
        if heat is not None:
            thermal_target *= heat.factor

        state.temperature = approach(state.temperature, thermal_target, dt, profile.thermal_time_constant_s)
        state.temperature += ou_step(0.0, 0.0, 0.0, 0.05, f"{state.asset_id}|tnoise", index)

        # ── Relay ───────────────────────────────────────────────────────
        relay = relay_state(state.device_status)
        if relay != state.relay_status:
            if relay == "Closed":
                # Count re-energisations, not de-energisations: the contact wear
                # happens on make.
                state.relay_operations += 1
            state.relay_status = relay

        # ── Condition ───────────────────────────────────────────────────
        state.observed_seconds += dt
        state.online_seconds += dt
        self._accrue_wear(state, dt, wear_scale)

        return self._emit(state, resolution)

    # ── Internals ───────────────────────────────────────────────────────

    def _advance_mode(self, state: AssetState) -> None:
        if state.elapsed_seconds < state.state_ends_at:
            return
        state.transition_index += 1
        state.load_state = self._next_state(state)
        state.state_ends_at = self._dwell_for(state, state.load_state)

    def _go_offline(self, state: AssetState, dt: float) -> None:
        """Drop the endpoint off the stream, holding its accumulators."""
        state.device_status = "Offline"
        state.load_state = "Offline"

        if state.relay_status != "Open":
            state.relay_status = "Open"

        # Electrical channels read zero because nothing is being published, and
        # the device cools toward ambient while it is dark.
        state.voltage = 0.0
        state.current = 0.0
        state.active_power = 0.0
        state.demand_power = 0.0
        state.power_factor = 0.0
        state.temperature = approach(
            state.temperature, state.profile.ambient_temperature_c, dt, state.profile.thermal_time_constant_s * 1.4
        )

        state.observed_seconds += dt
        # No runtime, no energy and no wear accrue while the device is dark.

    @staticmethod
    def _wear_of(state: AssetState, names: tuple[str, ...]) -> float:
        """Worst wear among the named parts, 0 when the class has none of them."""
        worst = 0.0
        for position, spec in enumerate(state.profile.components):
            if spec.name in names and position < len(state.wear):
                worst = max(worst, state.wear[position])
        return worst

    def _accrue_wear(self, state: AssetState, dt: float, wear_scale: float) -> None:
        """Age every component by this step.

        Stress is the excess above nominal, not the absolute level: a device
        running at half load and thirty degrees is not ageing faster than the
        rating it was designed around, while one at ninety per cent load and
        eighty per cent of its thermal ceiling is.
        """
        days = (dt / SECONDS_PER_DAY) * wear_scale
        if days <= 0.0:
            return

        thermal_stress = clamp01((state.temperature_ratio - 0.55) / 0.45)
        load_stress = clamp01((state.load_ratio - 0.5) / 0.5)
        # Relay operations and mode changes are the switching load on connectors
        # and cells; expressed per hour so it is comparable to the others.
        cycle_stress = clamp01(state.transition_index / max(1.0, state.runtime_hours * 4.0 + 8.0))

        duty = state.seed.duty_factor

        for position, spec in enumerate(state.profile.components):
            if position >= len(state.wear):
                continue

            multiplier = (
                1.0
                + thermal_stress * spec.thermal_sensitivity * 1.8
                + load_stress * spec.load_sensitivity * 1.1
                + cycle_stress * spec.cycle_sensitivity * 0.6
            )
            rate = spec.base_wear_per_day * duty * multiplier
            state.wear[position] = clamp01(state.wear[position] + rate * days)

            # Exponentially weighted, so the published rate reflects how this
            # unit has been treated rather than what it happens to be doing in
            # this one second.
            if position < len(state.wear_rate):
                state.wear_rate[position] = state.wear_rate[position] * 0.98 + rate * 0.02

    def _emit(self, state: AssetState, resolution: str) -> Reading:
        """Publish the sample and update the derived condition that goes with it."""
        # A live electrical or thermal excursion costs health while it lasts,
        # over and above accumulated wear — the device is genuinely less able to
        # do its job at that moment.
        penalty = 0.0
        if state.device_status != "Offline":
            if state.temperature_ratio > 0.88:
                penalty += (state.temperature_ratio - 0.88) * 42.0
            over_current = state.current / state.profile.max_current_a if state.profile.max_current_a > 0 else 0.0
            if over_current > 1.0:
                penalty += (over_current - 1.0) * 24.0

        state.health = health_from_wear(asset_wear(state.wear), penalty)

        reading = Reading(
            asset_id=state.asset_id,
            device_uid=state.device_uid,
            ts=state.ts,
            voltage=round(state.voltage, 3),
            current=round(state.current, 4),
            active_power=round(state.active_power, 2),
            apparent_power=apparent_power(state.voltage, state.current),
            reactive_power=reactive_power(state.voltage, state.current, state.power_factor),
            power_factor=round(state.power_factor, 4),
            frequency=round(state.frequency, 3),
            energy_kwh=round(state.energy_kwh, 6),
            runtime_hours=round(state.runtime_hours, 4),
            temperature=round(state.temperature, 2),
            relay_status=state.relay_status,
            relay_operations=state.relay_operations,
            device_status=state.device_status,
            health_score=state.health,
            load_state=state.load_state,
            resolution=resolution,
        )

        state.history.append(reading)
        return reading

    # ── Access ──────────────────────────────────────────────────────────

    def state(self, asset_id: str) -> AssetState | None:
        return self.states.get(asset_id)

    def latest(self, asset_id: str) -> Reading | None:
        state = self.states.get(asset_id)
        if state is None or not state.history:
            return None
        return state.history[-1]

    def all_latest(self) -> list[Reading]:
        return [state.history[-1] for state in self.states.values() if state.history]

    def window(self, asset_id: str, samples: int) -> list[Reading]:
        state = self.states.get(asset_id)
        if state is None:
            return []
        if samples >= len(state.history):
            return list(state.history)
        return list(state.history)[-samples:]

    def rewind_to(self, start: datetime) -> None:
        """Reset the clock so a back-fill can run forward from a point in the past."""
        for state in self.states.values():
            state.ts = start

    @property
    def asset_ids(self) -> list[str]:
        return list(self.states.keys())


def dt_days(seconds: float) -> float:
    """Seconds expressed in days — used by callers reasoning about wear."""
    return seconds / SECONDS_PER_DAY


def sanity_check(reading: Reading) -> bool:
    """Assert the published triangle closes, within floating-point tolerance.

    Used by the tests and by the back-fill: a reading whose apparent power does
    not match its voltage and current is a bug in the model, not a measurement.
    """
    expected_s = reading.voltage * reading.current
    # Relative as well as absolute, because the published values are rounded for
    # transport and that rounding scales with the magnitude being reported.
    if not math.isclose(expected_s, reading.apparent_power, rel_tol=1e-3, abs_tol=0.05):
        return False
    if reading.apparent_power > 0:
        expected_q = math.sqrt(max(0.0, expected_s**2 - reading.active_power**2))
        if not math.isclose(expected_q, reading.reactive_power, rel_tol=5e-3, abs_tol=0.5):
            return False
    return True
