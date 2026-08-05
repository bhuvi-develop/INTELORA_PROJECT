"""Device catalog.

The estate is Laptops and Mobile Chargers. Nothing else is commissioned, so
nothing else is generated — a register that invents equipment the site does not
own produces analytics nobody can act on.

Component lives are stated in days of continuous service and come from the real
figures for the hardware: a laptop battery at 900 days is roughly 1,000 charge
cycles, and a charger cable at 800 days is flex fatigue at the strain relief.
Every wear rate downstream is derived from these numbers rather than chosen.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LAPTOP = "Laptop"
MOBILE_CHARGER = "Mobile Charger"

CATEGORIES: tuple[str, ...] = (LAPTOP, MOBILE_CHARGER)


@dataclass(frozen=True)
class ComponentSpec:
    name: str
    #: Days of continuous nominal service before the part is spent.
    expected_life_days: float
    #: How strongly this part is aged by heat, 0 (indifferent) to 1 (dominated).
    thermal_sensitivity: float
    #: How strongly it is aged by electrical load.
    load_sensitivity: float
    #: How strongly it is aged by switching and connection cycles.
    cycle_sensitivity: float

    @property
    def base_wear_per_day(self) -> float:
        return 1.0 / self.expected_life_days


@dataclass(frozen=True)
class LoadState:
    """One operating mode and the electrical behaviour that goes with it."""

    name: str
    #: Target draw as a fraction of the asset's rated power.
    load_factor: float
    #: Displacement power factor in this mode.
    power_factor: float
    #: Seconds the asset stays in this mode, before per-asset variation.
    dwell_seconds: tuple[float, float]
    #: Where the mode can go next, and how often.
    transitions: tuple[tuple[str, float], ...]
    device_status: str = "Online"


@dataclass(frozen=True)
class CategoryProfile:
    category: str
    nominal_voltage: float
    rated_power_w: float
    nominal_frequency: float
    ambient_temperature_c: float
    #: Temperature rise above ambient at full rated load, once thermally soaked.
    thermal_rise_c: float
    #: Seconds for the thermal mass to cover ~63% of a step change.
    thermal_time_constant_s: float
    max_temperature_c: float
    max_current_a: float
    #: Fractional voltage window before a voltage anomaly is raised.
    voltage_tolerance: float
    #: Internal impedance, in volts of sag per amp drawn.
    supply_impedance: float
    components: tuple[ComponentSpec, ...]
    states: dict[str, LoadState] = field(default_factory=dict)
    initial_state: str = "Idle"


# ── Laptop ───────────────────────────────────────────────────────────────
#
# A laptop's day is a cycle: it is plugged in and charges hard, settles to
# running on mains while working, drops to idle between sessions, and sleeps.
# The current profile follows that story, which is what makes the telemetry
# read as a device rather than as a signal generator.

LAPTOP_STATES: dict[str, LoadState] = {
    "Charging": LoadState(
        name="Charging",
        load_factor=0.88,
        power_factor=0.95,
        dwell_seconds=(420.0, 1500.0),
        transitions=(("Active", 0.6), ("Idle", 0.4)),
    ),
    "Active": LoadState(
        name="Active",
        load_factor=0.62,
        power_factor=0.94,
        dwell_seconds=(300.0, 1200.0),
        transitions=(("Idle", 0.55), ("Charging", 0.3), ("Active", 0.15)),
    ),
    "Idle": LoadState(
        name="Idle",
        load_factor=0.27,
        power_factor=0.91,
        dwell_seconds=(240.0, 900.0),
        transitions=(("Active", 0.5), ("Standby", 0.3), ("Charging", 0.2)),
    ),
    "Standby": LoadState(
        name="Standby",
        load_factor=0.06,
        power_factor=0.72,
        dwell_seconds=(180.0, 720.0),
        transitions=(("Charging", 0.55), ("Active", 0.45)),
        device_status="Standby",
    ),
    "Offline": LoadState(
        name="Offline",
        load_factor=0.0,
        power_factor=0.0,
        dwell_seconds=(45.0, 180.0),
        transitions=(("Charging", 0.5), ("Idle", 0.5)),
        device_status="Offline",
    ),
}

LAPTOP_COMPONENTS: tuple[ComponentSpec, ...] = (
    ComponentSpec("Battery", 900.0, thermal_sensitivity=0.85, load_sensitivity=0.7, cycle_sensitivity=0.9),
    ComponentSpec("CPU", 4000.0, thermal_sensitivity=0.9, load_sensitivity=0.8, cycle_sensitivity=0.1),
    ComponentSpec("Cooling System", 1200.0, thermal_sensitivity=0.75, load_sensitivity=0.55, cycle_sensitivity=0.35),
    ComponentSpec("Power Adapter Port", 1800.0, thermal_sensitivity=0.3, load_sensitivity=0.65, cycle_sensitivity=0.85),
    ComponentSpec("RAM", 5000.0, thermal_sensitivity=0.5, load_sensitivity=0.35, cycle_sensitivity=0.05),
    ComponentSpec("SSD", 2200.0, thermal_sensitivity=0.45, load_sensitivity=0.6, cycle_sensitivity=0.2),
)


# ── Mobile Charger ───────────────────────────────────────────────────────
#
# A charger is either delivering into a battery or sitting at no-load. Its
# temperature swings faster than a laptop's because there is far less mass to
# heat, which the shorter thermal time constant reproduces.

CHARGER_STATES: dict[str, LoadState] = {
    "Heavy Load": LoadState(
        name="Heavy Load",
        load_factor=0.96,
        power_factor=0.93,
        dwell_seconds=(240.0, 900.0),
        transitions=(("Charging", 0.7), ("Trickle", 0.3)),
    ),
    "Charging": LoadState(
        name="Charging",
        load_factor=0.68,
        power_factor=0.92,
        dwell_seconds=(360.0, 1500.0),
        transitions=(("Trickle", 0.5), ("Heavy Load", 0.3), ("Charging", 0.2)),
    ),
    "Trickle": LoadState(
        name="Trickle",
        load_factor=0.2,
        power_factor=0.84,
        dwell_seconds=(300.0, 1080.0),
        transitions=(("Idle", 0.55), ("Charging", 0.45)),
    ),
    "Idle": LoadState(
        name="Idle",
        load_factor=0.03,
        power_factor=0.55,
        dwell_seconds=(300.0, 1500.0),
        transitions=(("Charging", 0.65), ("Heavy Load", 0.35)),
        device_status="Standby",
    ),
    "Offline": LoadState(
        name="Offline",
        load_factor=0.0,
        power_factor=0.0,
        dwell_seconds=(40.0, 150.0),
        transitions=(("Charging", 0.6), ("Idle", 0.4)),
        device_status="Offline",
    ),
}

CHARGER_COMPONENTS: tuple[ComponentSpec, ...] = (
    ComponentSpec("Power Module", 1500.0, thermal_sensitivity=0.85, load_sensitivity=0.8, cycle_sensitivity=0.3),
    ComponentSpec("Transformer", 2600.0, thermal_sensitivity=0.8, load_sensitivity=0.75, cycle_sensitivity=0.15),
    ComponentSpec("USB-C Output", 1100.0, thermal_sensitivity=0.35, load_sensitivity=0.55, cycle_sensitivity=0.9),
    ComponentSpec("Protection Circuit", 3000.0, thermal_sensitivity=0.6, load_sensitivity=0.5, cycle_sensitivity=0.4),
    ComponentSpec("Cable", 800.0, thermal_sensitivity=0.25, load_sensitivity=0.45, cycle_sensitivity=0.95),
    ComponentSpec("Thermal Sensor", 3500.0, thermal_sensitivity=0.7, load_sensitivity=0.2, cycle_sensitivity=0.1),
)


CATEGORY_PROFILES: dict[str, CategoryProfile] = {
    LAPTOP: CategoryProfile(
        category=LAPTOP,
        nominal_voltage=19.5,
        rated_power_w=65.0,
        nominal_frequency=50.0,
        ambient_temperature_c=27.0,
        thermal_rise_c=38.0,
        thermal_time_constant_s=210.0,
        max_temperature_c=78.0,
        max_current_a=4.6,
        voltage_tolerance=0.06,
        supply_impedance=0.16,
        components=LAPTOP_COMPONENTS,
        states=LAPTOP_STATES,
        initial_state="Active",
    ),
    MOBILE_CHARGER: CategoryProfile(
        category=MOBILE_CHARGER,
        nominal_voltage=19.8,
        rated_power_w=45.0,
        nominal_frequency=50.0,
        ambient_temperature_c=28.0,
        thermal_rise_c=29.0,
        thermal_time_constant_s=110.0,
        max_temperature_c=65.0,
        max_current_a=2.4,
        voltage_tolerance=0.07,
        supply_impedance=0.24,
        components=CHARGER_COMPONENTS,
        states=CHARGER_STATES,
        initial_state="Charging",
    ),
}


@dataclass(frozen=True)
class AssetSeed:
    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    criticality: str
    #: Duty multiplier on the wear rate — how hard this unit is worked.
    duty_factor: float
    #: Wear per component thirty days ago, aligned to the category component list.
    initial_wear: tuple[float, ...]
    #: Sparse profile overrides for units that differ from their class.
    overrides: dict[str, float] = field(default_factory=dict)


# Initial wear is hand-set rather than randomised so the estate presents a
# realistic spread from the first request: a healthy majority, a working middle
# and a small critical tail the maintenance modules have something to act on.
ASSET_SEEDS: tuple[AssetSeed, ...] = (
    # ── Laptops ─────────────────────────────────────────────────────────
    AssetSeed("LAP-001", "Dell Latitude 5420", LAPTOP, "Dell", "Latitude 5420", "Medium", 0.92,
              (0.06, 0.03, 0.05, 0.04, 0.02, 0.04)),
    AssetSeed("LAP-002", "HP EliteBook 840 G9", LAPTOP, "HP", "EliteBook 840 G9", "Medium", 1.04,
              (0.19, 0.08, 0.14, 0.09, 0.05, 0.11)),
    AssetSeed("LAP-003", "Lenovo ThinkPad T14s", LAPTOP, "Lenovo", "ThinkPad T14s Gen 3", "High", 1.42,
              (0.52, 0.34, 0.63, 0.28, 0.14, 0.31),
              {"rated_power_w": 78.0, "thermal_rise_c": 43.0}),
    AssetSeed("LAP-004", "Apple MacBook Pro 14", LAPTOP, "Apple", "MacBook Pro 14 M3", "High", 0.88,
              (0.09, 0.04, 0.06, 0.05, 0.03, 0.05),
              {"nominal_voltage": 20.5, "rated_power_w": 96.0, "max_current_a": 5.2}),
    AssetSeed("LAP-005", "Dell Precision 3580", LAPTOP, "Dell", "Precision 3580", "High", 1.28,
              (0.34, 0.22, 0.29, 0.41, 0.11, 0.24)),
    AssetSeed("LAP-006", "HP ZBook Firefly 14", LAPTOP, "HP", "ZBook Firefly 14 G10", "Medium", 1.35,
              (0.44, 0.31, 0.58, 0.22, 0.13, 0.27),
              {"rated_power_w": 90.0, "thermal_rise_c": 41.0}),
    AssetSeed("LAP-007", "Lenovo IdeaPad Slim 5", LAPTOP, "Lenovo", "IdeaPad Slim 5", "Low", 0.74,
              (0.12, 0.06, 0.09, 0.07, 0.04, 0.08)),
    AssetSeed("LAP-008", "Acer TravelMate P4", LAPTOP, "Acer", "TravelMate P414", "Medium", 1.16,
              (0.71, 0.26, 0.33, 0.48, 0.12, 0.29)),
    AssetSeed("LAP-009", "Asus ExpertBook B9", LAPTOP, "Asus", "ExpertBook B9450", "Medium", 0.96,
              (0.16, 0.09, 0.12, 0.1, 0.05, 0.13)),
    AssetSeed("LAP-010", "Dell Latitude 7440", LAPTOP, "Dell", "Latitude 7440", "Medium", 1.02,
              (0.23, 0.11, 0.18, 0.13, 0.06, 0.15)),
    AssetSeed("LAP-011", "HP ProBook 450 G10", LAPTOP, "HP", "ProBook 450 G10", "Low", 1.22,
              (0.38, 0.19, 0.26, 0.55, 0.09, 0.21)),
    AssetSeed("LAP-012", "Lenovo ThinkPad X1 Carbon", LAPTOP, "Lenovo", "ThinkPad X1 Carbon Gen 11", "High", 0.9,
              (0.11, 0.05, 0.08, 0.06, 0.03, 0.07)),
    AssetSeed("LAP-013", "Apple MacBook Air 13", LAPTOP, "Apple", "MacBook Air 13 M2", "Low", 0.82,
              (0.27, 0.13, 0.17, 0.12, 0.07, 0.16),
              {"nominal_voltage": 20.0, "rated_power_w": 35.0, "max_current_a": 2.4}),
    AssetSeed("LAP-014", "Asus Vivobook 15", LAPTOP, "Asus", "Vivobook 15 X1504", "Low", 1.31,
              (0.63, 0.41, 0.72, 0.35, 0.18, 0.44)),
    # ── Mobile Chargers ─────────────────────────────────────────────────
    AssetSeed("CHR-001", "Anker 45W USB-C Charger", MOBILE_CHARGER, "Anker", "PowerPort III 45W", "Low", 0.96,
              (0.07, 0.04, 0.09, 0.03, 0.12, 0.03)),
    AssetSeed("CHR-002", "Belkin 65W GaN Charger", MOBILE_CHARGER, "Belkin", "BoostCharge Pro 65W", "Medium", 1.34,
              (0.48, 0.29, 0.57, 0.21, 0.68, 0.18),
              {"rated_power_w": 65.0, "max_current_a": 3.25}),
    AssetSeed("CHR-003", "Samsung 45W Travel Adapter", MOBILE_CHARGER, "Samsung", "EP-T4510", "Low", 0.88,
              (0.11, 0.06, 0.14, 0.05, 0.19, 0.04)),
    AssetSeed("CHR-004", "Apple 35W Dual USB-C", MOBILE_CHARGER, "Apple", "A2676 35W", "Medium", 1.12,
              (0.31, 0.18, 0.36, 0.13, 0.42, 0.11),
              {"rated_power_w": 35.0, "max_current_a": 1.9}),
    AssetSeed("CHR-005", "Ugreen Nexode 45W", MOBILE_CHARGER, "Ugreen", "Nexode CD294", "Low", 1.02,
              (0.15, 0.09, 0.19, 0.07, 0.24, 0.06)),
    AssetSeed("CHR-006", "Anker 65W GaN Prime", MOBILE_CHARGER, "Anker", "GaNPrime 65W", "Medium", 1.41,
              (0.56, 0.34, 0.66, 0.27, 0.79, 0.22),
              {"rated_power_w": 65.0, "max_current_a": 3.25}),
    AssetSeed("CHR-007", "Baseus 30W PD Charger", MOBILE_CHARGER, "Baseus", "GaN5 Pro 30W", "Low", 0.79,
              (0.09, 0.05, 0.12, 0.04, 0.16, 0.03),
              {"rated_power_w": 30.0, "max_current_a": 1.7}),
    AssetSeed("CHR-008", "Dell 45W USB-C Adapter", MOBILE_CHARGER, "Dell", "LA45NM170", "Medium", 1.18,
              (0.38, 0.22, 0.44, 0.17, 0.61, 0.14)),
    AssetSeed("CHR-009", "HP 45W USB-C Adapter", MOBILE_CHARGER, "HP", "L43407-001", "Low", 1.06,
              (0.21, 0.13, 0.26, 0.09, 0.33, 0.08)),
    AssetSeed("CHR-010", "Lenovo 45W Slim Adapter", MOBILE_CHARGER, "Lenovo", "ADLX45YCC3D", "Medium", 1.37,
              (0.51, 0.31, 0.61, 0.24, 0.73, 0.19)),
)


SEED_BY_ID: dict[str, AssetSeed] = {seed.asset_id: seed for seed in ASSET_SEEDS}


def profile_for(seed: AssetSeed) -> CategoryProfile:
    """Category profile with this unit's overrides applied."""
    base = CATEGORY_PROFILES[seed.category]
    if not seed.overrides:
        return base

    fields = {
        "nominal_voltage": base.nominal_voltage,
        "rated_power_w": base.rated_power_w,
        "nominal_frequency": base.nominal_frequency,
        "ambient_temperature_c": base.ambient_temperature_c,
        "thermal_rise_c": base.thermal_rise_c,
        "thermal_time_constant_s": base.thermal_time_constant_s,
        "max_temperature_c": base.max_temperature_c,
        "max_current_a": base.max_current_a,
        "voltage_tolerance": base.voltage_tolerance,
        "supply_impedance": base.supply_impedance,
    }
    fields.update({key: value for key, value in seed.overrides.items() if key in fields})

    return CategoryProfile(
        category=base.category,
        components=base.components,
        states=base.states,
        initial_state=base.initial_state,
        **fields,
    )


def device_uid_for(asset_id: str) -> str:
    """Serial of the MIKOS sensor installed on an asset."""
    return f"MIKOS-{asset_id.replace('-', '')}"


def mqtt_topic_for(asset_id: str) -> str:
    return f"intelora/mikos/{asset_id.lower()}/telemetry"
