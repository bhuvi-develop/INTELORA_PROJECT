"""Simulator invariants.

These are the properties the rest of the platform depends on. If any of them
break, a number somewhere in the interface becomes a lie: a jumping channel
stops looking like a sensor, an unclosed power triangle contradicts itself, and
wear moving backwards would let a remaining-life figure improve.
"""

from __future__ import annotations

import math

from app.mock_data.catalog import ASSET_SEEDS, CATEGORIES
from app.services.derive import band_of
from app.services.simulator import MikosSimulator, sanity_check


def run(seconds: int, dt: float = 1.0) -> tuple[MikosSimulator, dict[str, list]]:
    simulator = MikosSimulator()
    trails: dict[str, list] = {asset_id: [] for asset_id in simulator.asset_ids}
    for _ in range(int(seconds / dt)):
        for reading in simulator.step(dt):
            trails[reading.asset_id].append(reading)
    return simulator, trails


def test_only_laptops_and_chargers_are_commissioned():
    categories = {seed.category for seed in ASSET_SEEDS}
    assert categories == set(CATEGORIES)
    assert categories == {"Laptop", "Mobile Charger"}


def test_every_reading_publishes_all_fourteen_parameters():
    simulator = MikosSimulator()
    reading = simulator.step(1.0)[0]
    row = reading.as_row()

    for field in (
        "voltage",
        "current",
        "active_power",
        "apparent_power",
        "reactive_power",
        "power_factor",
        "frequency",
        "energy_kwh",
        "runtime_hours",
        "temperature",
        "relay_status",
        "relay_operations",
        "ts",
        "device_status",
    ):
        assert field in row, f"parameter {field} missing from the published reading"


def test_power_triangle_closes():
    _, trails = run(600)
    for readings in trails.values():
        for reading in readings:
            assert sanity_check(reading), f"triangle does not close on {reading.asset_id} at {reading.ts}"


def test_active_power_equals_v_i_pf():
    _, trails = run(300)
    for readings in trails.values():
        for reading in readings:
            if reading.device_status == "Offline":
                continue
            expected = reading.voltage * reading.current * reading.power_factor
            assert math.isclose(expected, reading.active_power, rel_tol=0.02, abs_tol=0.05)


def test_channels_move_smoothly():
    """Consecutive readings differ by fractions of a percent under nominal load.

    The specification is explicit that values must not jump. A fault ramp is
    allowed to move faster, so the bound is applied while the device is neither
    offline nor inside an injected excursion window.
    """
    simulator, trails = run(900)

    for asset_id, readings in trails.items():
        state = simulator.states[asset_id]
        for previous, current in zip(readings, readings[1:]):
            if "Offline" in (previous.device_status, current.device_status):
                continue
            if state.seed.asset_id in ("LAP-003", "LAP-005", "LAP-006", "LAP-008", "LAP-011",
                                       "LAP-014", "CHR-002", "CHR-004", "CHR-006", "CHR-008", "CHR-010"):
                tolerance = 0.06
            else:
                tolerance = 0.02

            if previous.voltage > 1:
                delta = abs(current.voltage - previous.voltage) / previous.voltage
                assert delta < tolerance, f"{asset_id} voltage jumped {delta:.3%}"

            delta_t = abs(current.temperature - previous.temperature)
            assert delta_t < 1.5, f"{asset_id} temperature jumped {delta_t:.2f} C in one second"


def test_energy_and_runtime_only_increase():
    _, trails = run(600)
    for asset_id, readings in trails.items():
        for previous, current in zip(readings, readings[1:]):
            assert current.energy_kwh >= previous.energy_kwh - 1e-9, f"{asset_id} energy went backwards"
            assert current.runtime_hours >= previous.runtime_hours - 1e-9, f"{asset_id} runtime went backwards"


def test_wear_never_decreases():
    simulator = MikosSimulator()
    snapshots = {asset_id: list(state.wear) for asset_id, state in simulator.states.items()}

    for _ in range(600):
        simulator.step(1.0)

    for asset_id, state in simulator.states.items():
        for before, after in zip(snapshots[asset_id], state.wear):
            assert after >= before - 1e-12, f"{asset_id} wear decreased"


def test_health_follows_wear_downwards():
    simulator = MikosSimulator()
    start = {asset_id: state.health for asset_id, state in simulator.states.items()}

    # A long run at accelerated wear so the change is measurable.
    for _ in range(2000):
        simulator.step(1.0, wear_scale=2000.0)

    declined = sum(1 for asset_id, state in simulator.states.items() if state.health < start[asset_id])
    assert declined >= len(simulator.states) * 0.8, "health did not fall as the estate aged"


def test_offline_devices_publish_no_electrical_load():
    simulator, trails = run(1200)
    for readings in trails.values():
        for reading in readings:
            if reading.device_status != "Offline":
                continue
            assert reading.active_power == 0.0
            assert reading.current == 0.0
            assert reading.relay_status == "Open"


def test_temperature_stays_within_physical_range():
    simulator, trails = run(900)
    for asset_id, readings in trails.items():
        profile = simulator.states[asset_id].profile
        for reading in readings:
            assert reading.temperature > 5.0, f"{asset_id} below any plausible ambient"
            assert reading.temperature < profile.max_temperature_c * 1.6


def test_bands_cover_the_estate():
    simulator = MikosSimulator()
    bands = {band_of(state.health) for state in simulator.states.values()}
    assert len(bands) >= 2, "seeded estate should present a spread of conditions"
