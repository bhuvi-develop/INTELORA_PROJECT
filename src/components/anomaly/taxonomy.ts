import type { AnomalyRecord, AnomalyType, Severity, TelemetryChannel } from '@/engine/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Failure taxonomy — M01 … M15.
 *
 * The backend detector raises events against nine channel rules, each judged on
 * the device's own profile limits with hysteresis (see `anomaly_service.py`).
 * A channel rule is not a failure mode: an over-current that clears in seconds
 * is an inrush transient, and the same rule breached for a minute is a genuine
 * overcurrent. This module is the layer that reads a delivered event and names
 * the failure mode behind it.
 *
 * Every discriminator below uses a field the platform actually publishes —
 * breach magnitude against the device's own limit, how long the event stayed
 * open, and the serviceable part the detector attributed it to. Nothing here
 * invents a measurement, and nothing here re-judges whether an event should
 * have been raised; that decision was made upstream and is passed through.
 *
 * Classification is deterministic: rules are evaluated in array order and the
 * first match owns the record, so the class counts always sum to the journal.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── Fault classes ──────────────────────────────────────────────────────── */

export type FaultClassId =
  | 'ELECTRICAL'
  | 'THERMAL'
  | 'DEGRADATION'
  | 'COMMUNICATION'
  | 'MECHANICAL'
  | 'GRID_TRANSIENT';

export interface FaultClassDef {
  id: FaultClassId;
  label: string;
  /** Compact label for chips and axis ticks. */
  short: string;
  color: string;
  description: string;
}

/**
 * Six classes, in the order they are ranked and rendered.
 *
 * The hues are separated for adjacency in the donut and reused as the accent on
 * every control bound to that class, so a colour on this page always means the
 * same fault family.
 */
export const FAULT_CLASSES: FaultClassDef[] = [
  {
    id: 'ELECTRICAL',
    label: 'Electrical Faults',
    short: 'Electrical',
    color: '#38BDF8',
    description:
      'Voltage, current, active power and displacement-factor breaches measured at the device input.',
  },
  {
    id: 'THERMAL',
    label: 'Thermal Anomalies',
    short: 'Thermal',
    color: '#F97316',
    description: 'Internal temperature above the limit held on the device profile, and the ramp toward it.',
  },
  {
    id: 'DEGRADATION',
    label: 'Degradation & Aging',
    short: 'Degradation',
    color: '#A855F7',
    description:
      'Consumption drift against the device’s own trailing baseline — the signature of a unit quietly doing the same job for more energy.',
  },
  {
    id: 'GRID_TRANSIENT',
    label: 'Grid Transients',
    short: 'Grid',
    color: '#EAB308',
    description: 'Short excursions originating upstream of the device: rail flicker and supply frequency drift.',
  },
  {
    id: 'COMMUNICATION',
    label: 'Communication',
    short: 'Comms',
    color: '#2DD4BF',
    description: 'Loss of the telemetry link. While it is open the platform cannot assert any other limit.',
  },
  {
    id: 'MECHANICAL',
    label: 'Mechanical',
    short: 'Mechanical',
    color: '#94A3B8',
    description: 'Faults the detector attributed to a moving or airflow part rather than to the electronics.',
  },
];

const CLASS_BY_ID = new Map(FAULT_CLASSES.map((entry) => [entry.id, entry]));

export const faultClass = (id: FaultClassId): FaultClassDef => CLASS_BY_ID.get(id) ?? FAULT_CLASSES[0];

/* ─── Selections ─────────────────────────────────────────────────────────── */

/**
 * Category selection.
 *
 * The specification names four values; the donut exposes all six classes as
 * slices, so the union covers every class rather than leaving three of them
 * unselectable.
 */
export type CategorySelection = 'ALL' | FaultClassId;

/** Severity selection. `MAJOR` is present because the engine raises that band. */
export type SeveritySelection = 'ALL' | 'CRITICAL' | 'MAJOR' | 'WARNING' | 'INFO';

export const SEVERITY_FOR_SELECTION: Record<Exclude<SeveritySelection, 'ALL'>, Severity> = {
  CRITICAL: 'Critical',
  MAJOR: 'Major',
  WARNING: 'Warning',
  INFO: 'Info',
};

export const SELECTION_FOR_SEVERITY: Record<Severity, SeveritySelection> = {
  Critical: 'CRITICAL',
  Major: 'MAJOR',
  Warning: 'WARNING',
  Info: 'INFO',
};

/* ─── Measured discriminators ────────────────────────────────────────────── */

/**
 * How far past its own limit the reading sat, as a fraction.
 *
 * This is the same quantity the backend grades severity on: ≥ 0.18 Critical,
 * ≥ 0.08 Major, ≥ 0.025 Warning. Reusing it means a rule that splits on 0.08
 * splits exactly where the platform's own severity boundary sits.
 */
export const breachRatio = (record: AnomalyRecord): number =>
  record.threshold === 0 ? 1 : Math.abs(record.observed - record.threshold) / Math.abs(record.threshold);

/** How long the event has been, or was, open. */
export const openMs = (record: AnomalyRecord, now: number): number =>
  Math.max(0, (record.resolvedAt ?? now) - record.timestamp);

/** An event that cleared inside a minute did not persist; it was a transient. */
const TRANSIENT_MS = 60_000;

export const isTransient = (record: AnomalyRecord, now: number): boolean =>
  record.resolvedAt !== null && openMs(record, now) <= TRANSIENT_MS;

/** Parts the detector attributes to airflow or actuation rather than electronics. */
const MECHANICAL_PARTS = new Set(['Cooling System']);

/* ─── Rules ──────────────────────────────────────────────────────────────── */

export interface FaultRule {
  /** Stable operator-facing identifier, M01 … M15. */
  id: string;
  name: string;
  classId: FaultClassId;
  /** Failure signature as an engineer would name it. */
  signature: string;
  /** The condition, written as the detector applies it. */
  expression: string;
  /** Telemetry channel the rule is evaluated against. */
  channel: TelemetryChannel;
  /** Channel rules that can produce this failure mode. */
  types: AnomalyType[];
  /** Seconds the breach must persist before the event is raised. */
  dwellSeconds: number;
  /** Seconds the reading must sit back inside the limit before it clears. */
  clearSeconds: number;
  detail: string;
  /** Applied after the channel-rule check. First rule to match owns the record. */
  refine?: (record: AnomalyRecord, now: number) => boolean;
}

/**
 * The fifteen failure modes, in evaluation order.
 *
 * Dwell and clear windows are the detector's published `confirm_seconds` and
 * `clear_seconds` for the underlying channel rule, so the latency figures on
 * this page quote the platform's configuration rather than an assumption.
 */
export const FAULT_RULES: FaultRule[] = [
  {
    id: 'M01',
    name: 'Voltage Surge',
    classId: 'ELECTRICAL',
    signature: 'Voltage Surge',
    expression: 'V_rms > V_nom·(1 + tol) for ≥ 6 s, breach ≥ 8%',
    channel: 'voltage',
    types: ['voltage-high'],
    dwellSeconds: 6,
    clearSeconds: 12,
    detail:
      'Sustained over-voltage at the input. The regulator holds the rail, but the stress is carried by the input stage and it shortens component life.',
    refine: (record) => breachRatio(record) >= 0.08,
  },
  {
    id: 'M02',
    name: 'Voltage Sag',
    classId: 'ELECTRICAL',
    signature: 'Voltage Sag',
    expression: 'V_rms < V_nom·(1 − tol) for ≥ 6 s, breach ≥ 8%',
    channel: 'voltage',
    types: ['voltage-low'],
    dwellSeconds: 6,
    clearSeconds: 12,
    detail:
      'Sustained under-voltage. The device draws a higher current for the same delivered load, which pushes the thermal and current envelopes together.',
    refine: (record) => breachRatio(record) >= 0.08,
  },
  {
    id: 'M03',
    name: 'Rail Voltage Flicker',
    classId: 'GRID_TRANSIENT',
    signature: 'Marginal Rail Excursion',
    expression: 'V_rms outside tolerance, breach < 8%',
    channel: 'voltage',
    types: ['voltage-high', 'voltage-low'],
    dwellSeconds: 6,
    clearSeconds: 12,
    detail:
      'A marginal excursion either side of the tolerance band. The magnitude points upstream of the device rather than at its own regulation.',
  },
  {
    id: 'M04',
    name: 'Inrush Current Transient',
    classId: 'ELECTRICAL',
    signature: 'Inrush Transient',
    expression: 'I_rms > I_max for ≥ 3 s, cleared within 60 s',
    channel: 'current',
    types: ['current-spike'],
    dwellSeconds: 3,
    clearSeconds: 8,
    detail:
      'A short overcurrent that returned inside the limit under its own steam — the profile of a load step or a capacitor charging, not of a fault.',
    refine: (record, now) => isTransient(record, now),
  },
  {
    id: 'M05',
    name: 'Sustained Overcurrent',
    classId: 'ELECTRICAL',
    signature: 'Overcurrent',
    expression: 'I_rms > I_max held beyond 60 s',
    channel: 'current',
    types: ['current-spike'],
    dwellSeconds: 3,
    clearSeconds: 8,
    detail:
      'Current above the device rating that did not recover. Indicates a shorting load or failing regulation and carries a real thermal consequence.',
  },
  {
    id: 'M06',
    name: 'Active Power Surge',
    classId: 'ELECTRICAL',
    signature: 'Power Surge',
    expression: 'P > 1.15 · P_rated for ≥ 4 s, breach ≥ 15%',
    channel: 'power',
    types: ['power-surge'],
    dwellSeconds: 4,
    clearSeconds: 10,
    detail: 'Active power well past the envelope for this device class — the load itself is out of specification.',
    refine: (record) => breachRatio(record) >= 0.15,
  },
  {
    id: 'M07',
    name: 'Harmonic Distortion Spike',
    classId: 'ELECTRICAL',
    signature: 'Harmonic Distortion Spike',
    expression: 'P over envelope by < 15% with no proportional I_rms breach',
    channel: 'power',
    types: ['power-surge'],
    dwellSeconds: 4,
    clearSeconds: 10,
    detail:
      'Power above the envelope without a matching current breach. The extra draw is distortion rather than useful load — the current waveform is no longer clean.',
  },
  {
    id: 'M08',
    name: 'Power Factor Drop',
    classId: 'ELECTRICAL',
    signature: 'Power Factor Drop',
    expression: 'PF < 0.62 for ≥ 20 s, evaluated above 10% load',
    channel: 'powerFactor',
    types: ['power-factor-low'],
    dwellSeconds: 20,
    clearSeconds: 30,
    detail:
      'Displacement factor below the floor while the device is meaningfully loaded. Apparent power rises for the same useful work.',
  },
  {
    id: 'M09',
    name: 'Cooling System Failure',
    classId: 'MECHANICAL',
    signature: 'Airflow Degradation',
    expression: 'T > T_max with the attribution resolving to the cooling assembly',
    channel: 'temperature',
    types: ['temperature-high'],
    dwellSeconds: 8,
    clearSeconds: 20,
    detail:
      'The detector attributed the over-temperature to the cooling assembly. The electrical channels are inside their limits, so the heat is not being removed rather than being generated.',
    refine: (record) => record.component !== null && MECHANICAL_PARTS.has(record.component),
  },
  {
    id: 'M10',
    name: 'Thermal Ramp',
    classId: 'THERMAL',
    signature: 'Thermal Ramp',
    expression: 'T > T_max for ≥ 8 s, breach ≥ 18%',
    channel: 'temperature',
    types: ['temperature-high'],
    dwellSeconds: 8,
    clearSeconds: 20,
    detail:
      'Temperature climbing well past the limit. Above this point throttling is already active and degradation accelerates non-linearly.',
    refine: (record) => breachRatio(record) >= 0.18,
  },
  {
    id: 'M11',
    name: 'Enclosure Over-temperature',
    classId: 'THERMAL',
    signature: 'Over-temperature',
    expression: 'T > T_max for ≥ 8 s, breach < 18%',
    channel: 'temperature',
    types: ['temperature-high'],
    dwellSeconds: 8,
    clearSeconds: 20,
    detail: 'Steady operation above the thermal limit held on the device profile, without a runaway ramp.',
  },
  {
    id: 'M12',
    name: 'Energy Consumption Drift',
    classId: 'DEGRADATION',
    signature: 'Consumption Drift',
    expression: 'kWh rate > 1.6 × trailing baseline for ≥ 60 s, breach < 25%',
    channel: 'energy',
    types: ['energy-spike'],
    dwellSeconds: 60,
    clearSeconds: 60,
    detail:
      'The device is consuming more than its own recent baseline for the same job. No instantaneous limit would notice this.',
    refine: (record) => breachRatio(record) < 0.25,
  },
  {
    id: 'M13',
    name: 'Leakage Signature',
    classId: 'DEGRADATION',
    signature: 'MOSFET Leakage',
    expression: 'kWh rate > 1.6 × trailing baseline, breach ≥ 25%',
    channel: 'energy',
    types: ['energy-spike'],
    dwellSeconds: 60,
    clearSeconds: 60,
    detail:
      'Consumption far above the device’s own baseline with the load unchanged — the profile of switching-stage leakage rather than of extra work.',
  },
  {
    id: 'M14',
    name: 'Grid Frequency Excursion',
    classId: 'GRID_TRANSIENT',
    signature: 'Frequency Drift',
    expression: '|f − f_nom| > 0.8 Hz for ≥ 10 s',
    channel: 'frequency',
    types: ['frequency-deviation'],
    dwellSeconds: 10,
    clearSeconds: 15,
    detail: 'Supply frequency outside the band. Nothing on the device causes this; the origin is upstream.',
  },
  {
    id: 'M15',
    name: 'Telemetry Link Loss',
    classId: 'COMMUNICATION',
    signature: 'Link Loss',
    expression: 'No packet for ≥ 3 s at a 1 Hz publication rate',
    channel: 'health',
    types: ['communication-lost'],
    dwellSeconds: 3,
    clearSeconds: 3,
    detail:
      'The endpoint stopped publishing. Every other open event on the device is closed while this is raised, because the platform can no longer observe the limit it was asserting.',
  },
];

const RULE_BY_ID = new Map(FAULT_RULES.map((rule) => [rule.id, rule]));

export const faultRule = (id: string): FaultRule | undefined => RULE_BY_ID.get(id);

/**
 * The failure mode behind one delivered event.
 *
 * Returns `null` only if the platform ever publishes a channel rule this
 * taxonomy has not been extended for — which is the signal to extend it, not a
 * condition to swallow silently.
 */
export const classifyRecord = (record: AnomalyRecord, now: number): FaultRule | null =>
  FAULT_RULES.find((rule) => rule.types.includes(record.type) && (rule.refine?.(record, now) ?? true)) ?? null;

/* ─── Corrective action ──────────────────────────────────────────────────── */

/**
 * What to do about each failure mode.
 *
 * Held apart from the rule rather than on it: the condition that recognises a
 * fault is a property of the detector, while the response to it is operational
 * policy and changes on a different clock. Keeping them in separate maps means
 * revising a work instruction cannot accidentally alter a detection boundary.
 */
export const RULE_REMEDY: Record<string, string> = {
  M01: 'Verify the supply against the device rating and check the adapter output under load. Sustained over-voltage on a healthy supply implicates the regulator.',
  M02: 'Check the adapter and cable under load. A sag that tracks processor demand points at the adapter rather than the mains.',
  M03: 'No device-side action. Log against the supply and correlate with other endpoints on the same circuit before escalating upstream.',
  M04: 'None required if isolated. Recurring inrush on every charge cycle indicates a battery approaching end of life — review its remaining life.',
  M05: 'Remove the load and inspect for a short. Do not clear the alarm until the current returns inside the rating on its own.',
  M06: 'Confirm the workload is within the device duty envelope. Sustained operation past the rating shortens life even when nothing trips.',
  M07: 'Inspect the switching stage. Extra apparent power without a matching current breach points at a distorted waveform rather than extra work.',
  M08: 'Check the power module and any inline conversion. A poor displacement factor raises apparent power for the same useful output.',
  M09: 'Physical inspection: clear the vents, verify fan rotation and check for dust ingress. Electrical channels are inside limits, so this is airflow.',
  M10: 'Reduce load immediately and inspect cooling. Above this point degradation is non-linear and remaining life is being spent quickly.',
  M11: 'Review placement and ambient conditions. Steady operation above the thermal limit is a siting problem as often as a hardware one.',
  M12: 'Compare against the device baseline over a longer window. Drift without a load change is the earliest sign of conversion loss.',
  M13: 'Schedule the switching stage for replacement. Leakage does not recover, and the consumption penalty compounds.',
  M14: 'No device-side action. Raise with the supply owner; the origin is upstream of every endpoint on the circuit.',
  M15: 'Check the physical connection and the gateway path. While this is open, no other limit can be asserted on the device.',
};

export const ruleRemedy = (ruleId: string): string =>
  RULE_REMEDY[ruleId] ?? 'No standing work instruction for this signature.';

/* ─── Signal isolation ───────────────────────────────────────────────────── */

/**
 * Channels worth plotting for each class.
 *
 * Selecting Electrical isolates the electrical stream and drops temperature and
 * energy from the trace, which is the whole point of the drill-down: fewer
 * signals, all of them relevant to the fault in hand.
 */
export const CHANNELS_FOR_CLASS: Record<CategorySelection, TelemetryChannel[]> = {
  ALL: ['voltage', 'current', 'power'],
  ELECTRICAL: ['voltage', 'current', 'powerFactor'],
  THERMAL: ['temperature', 'power'],
  DEGRADATION: ['energy', 'health'],
  GRID_TRANSIENT: ['voltage', 'frequency'],
  COMMUNICATION: ['health'],
  MECHANICAL: ['temperature', 'power'],
};

/* ─── Commercial rates ───────────────────────────────────────────────────── */

/**
 * The two figures the cost model cannot measure.
 *
 * A monetary result needs a rate, and the platform does not hold one — these
 * are stated here, quoted in the tile's tooltip, and are the only numbers on
 * this page that are not derived from telemetry.
 */
export const COST_MODEL = {
  /** USD per device-hour out of service. */
  downtimeRatePerHour: 45,
  /** USD, mean cost of replacing one endpoint. */
  unitReplacementCost: 320,
} as const;

/* ─── Detection SLA ──────────────────────────────────────────────────────── */

/** Milliseconds allowed for the raise-to-screen leg of the pipeline. */
export const BROADCAST_SLA_MS = 200;

/** Publication interval the sensors run at, and the tolerance on a missed packet. */
export const PING_INTERVAL_MS = 1_000;
export const PING_TOLERANCE_MS = 1_500;

/* ─── Sensor plausibility ────────────────────────────────────────────────── */

/**
 * What the instrument can physically report — not what the device should be
 * doing.
 *
 * This distinction matters and is easy to get backwards. A laptop adapter at
 * 21 V is out of its *operating* limit, and the detector already raises an
 * over-voltage for that; the stream is fine and the status card should stay
 * green. A channel reporting 400 V or −80 °C is out of the *instrument's* range,
 * which means the reading is not a measurement at all — and no downstream
 * judgement made from it can be trusted.
 *
 * The status card checks the second thing. The bounds are the MIKOS sensor
 * ranges, so they sit far outside any device's operating envelope by design.
 */
export const SENSOR_RANGE = {
  voltage: { min: 0, max: 265, unit: 'V' },
  temperature: { min: -40, max: 105, unit: '°C' },
  powerFactor: { min: 0, max: 1, unit: '' },
  current: { min: 0, max: 100, unit: 'A' },
} as const;

export type SensorRangeKey = keyof typeof SENSOR_RANGE;

/** True when the reading is a number the instrument could actually have produced. */
export const withinSensorRange = (key: SensorRangeKey, value: number): boolean => {
  const range = SENSOR_RANGE[key];
  return Number.isFinite(value) && value >= range.min && value <= range.max;
};
