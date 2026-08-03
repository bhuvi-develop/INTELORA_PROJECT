import type { ApmAssetDto, ApmClassCountDto, ApmOverviewDto, ApmScopeDto, ApmTierCountDto } from '@/types/api';

/* ───────────────────────────────────────────────────────────────────────────
 * APM contracts.
 *
 * Asset Performance Management sits between Predictive Maintenance and OEE in
 * the MIKOS chain:
 *
 *   Telemetry → Anomaly Detection → Predictive Maintenance → APM → OEE
 *
 * APM detects nothing and predicts nothing. It consumes what AD and PdM
 * published, aggregates device records into asset records, applies the
 * criticality model, and publishes maintenance decisions and reliability
 * figures that OEE reads downstream.
 *
 * These interfaces describe what `/api/apm/*` already returns. They are a
 * transcription of the served payloads, not a redesign of them — the service
 * layer in `platform.service.ts` types most of these endpoints as
 * `Record<string, unknown>`, and every consumer then reaches into them
 * untyped. Naming the shapes here is what lets the module be strongly typed
 * without touching a single line of the backend.
 *
 * Anything the backend may legitimately omit is optional. Reading an APM
 * payload should never be able to throw.
 * ─────────────────────────────────────────────────────────────────────────── */

export type { ApmAssetDto, ApmClassCountDto, ApmOverviewDto, ApmScopeDto, ApmTierCountDto };

/** Envelope every APM response carries. */
export interface ApmMeta {
  tick?: number;
  generated_at?: string;
  [key: string]: unknown;
}

/* ─── Maintenance backlog ────────────────────────────────────────────────── */

/**
 * The outstanding work, sized in the units a planner schedules against.
 *
 * `weeks_of_work` is the field that makes the count actionable: forty open
 * orders means nothing on its own, three weeks of crew capacity means
 * something.
 */
export interface ApmBacklogSummary {
  total: number;
  /** Open orders past their due date. */
  overdue: number;
  /** Open orders due inside the next seven days. */
  due_soon: number;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  /** Estimated labour hours outstanding. */
  labour_hours: number;
  /** Outstanding hours expressed against the configured crew capacity. */
  weeks_of_work: number;
  /** Estimated cost of the outstanding work. */
  cost: number;
  mean_age_days: number;
  oldest_age_days: number;
  aged_over_30d: number;
  awaiting_approval: number;
  unassigned: number;
}

/* ─── Maintenance effectiveness ──────────────────────────────────────────── */

/**
 * Whether the maintenance programme is working.
 *
 * Five components, each scored against its own target and reported separately
 * as well as combined — a single effectiveness percentage nobody can decompose
 * is a figure nobody trusts.
 */
export interface ApmEffectiveness {
  /** Share of completed work that was planned rather than reactive. */
  planned_ratio: number;
  /** Share of completed work finished on or before its due date. */
  schedule_compliance: number;
  /** Share of signed-off work that came back. */
  rework_rate: number;
  /** Measured mean time to restore across closed corrective work, in minutes. */
  mttr_minutes: number;
  /** Share of raised work that has been closed. */
  completion_rate: number;
  /** 0–100 composite. */
  score: number;
  /** Per-component attainment against target, 0–1. */
  components: Record<string, number>;
  /** Orders the figures were computed from. */
  sample: number;
}

export interface ApmEffectivenessTargets {
  planned_ratio: number;
  schedule_compliance: number;
  mttr_minutes: number;
  rework_rate: number;
}

/* ─── Economics ──────────────────────────────────────────────────────────── */

/**
 * Spend and exposure, deliberately kept in separate fields.
 *
 * Spend is committed and is a fact. Exposure is a probability times a
 * consequence and is not a cost yet. Reporting them in one column is how a
 * maintenance budget argument gets lost, so the UI keeps them apart too.
 */
export interface ApmEconomics {
  currency: string;
  committed_spend: number;
  planned_spend: number;
  reactive_spend: number;
  planned_spend_ratio: number;
  backlog_cost: number;
  total_exposure: number;
  unaddressed_exposure: number;
  downtime_cost: number;
  avoidable_exposure: number;
  roi: number;
  return_per_unit_spend: number;
}

/* ─── Reliability ────────────────────────────────────────────────────────── */

export interface ApmFleetReliability {
  assets: number;
  availability_pct: number;
  inherent_availability_pct: number;
  total_downtime_hours: number;
  total_failures: number;
  mtbf_sample: number;
  mtbf_hours: number;
  mttr_sample: number;
  mttr_minutes: number;
  failure_rate_per_1000h: number;
  /** False when the sample is too small to quote a rate from. */
  rate_credible: boolean;
  assets_with_open_failures: number;
  assets_below_target: number;
}

export interface ApmFleetHealth {
  assets: number;
  mean_index: number;
  weighted_index: number;
  band_counts: Record<string, number>;
  below_floor: number;
  operationally_impaired: number;
}

/* ─── Work orders ────────────────────────────────────────────────────────── */

export type WorkOrderStatus =
  | 'Open'
  | 'Approved'
  | 'Assigned'
  | 'In Progress'
  | 'Completed'
  | 'Verified'
  | 'Cancelled';

/**
 * One maintenance instruction.
 *
 * Fields beyond the identity block are optional because the queue endpoint and
 * the single-order endpoint return different depths of the same record.
 */
export interface ApmWorkOrder {
  work_order_id: string;
  asset_id: string;
  asset_name?: string;
  category?: string;
  work_order_type?: string;
  /** Which upstream module caused this order to be raised. */
  origin?: string;
  /** False when the order was raised reactively rather than scheduled. */
  planned?: boolean;
  title?: string;
  description?: string;
  priority?: string;
  priority_code?: string;
  priority_score?: number;
  criticality_code?: string;
  risk_score?: number;
  status: string;
  raised_at?: string;
  due_at?: string | null;
  approved_at?: string | null;
  completed_at?: string | null;
  verified_at?: string | null;
  estimated_cost?: number;
  estimated_hours?: number;
  component?: string | null;
  assignee?: string | null;
  approver?: string | null;
  is_open?: boolean;
  is_overdue?: boolean;
  age_days?: number;
  [key: string]: unknown;
}

/* ─── Hierarchy ──────────────────────────────────────────────────────────── */

export type ApmHierarchyLevel =
  | 'enterprise'
  | 'portfolio'
  | 'site'
  | 'floor'
  | 'zone'
  | 'asset'
  | 'sensor';

export interface ApmHierarchyNode {
  id: string;
  name: string;
  level: ApmHierarchyLevel | string;
  children?: ApmHierarchyNode[];
  /** Rolled-up figures the backend attaches to interior nodes. */
  assets?: number;
  health_index?: number;
  availability_pct?: number;
  risk_score?: number;
  open_work_orders?: number;
  [key: string]: unknown;
}

/* ─── Endpoint payloads ──────────────────────────────────────────────────── */

export interface ApmBacklogResponse {
  backlog: ApmBacklogSummary;
  work_orders: ApmWorkOrder[];
  capacity: { weekly_labour_hours: number; weeks_of_work: number };
  meta?: ApmMeta;
}

export interface ApmEffectivenessResponse {
  effectiveness: ApmEffectiveness;
  targets: ApmEffectivenessTargets;
  economics: ApmEconomics;
  reliability: ApmFleetReliability;
  meta?: ApmMeta;
}

export interface ApmWorkOrderListResponse {
  work_orders: ApmWorkOrder[];
  total?: number;
  returned?: number;
  meta?: ApmMeta;
}

export interface ApmHierarchyResponse {
  hierarchy?: ApmHierarchyNode;
  root?: ApmHierarchyNode;
  nodes?: ApmHierarchyNode[];
  meta?: ApmMeta;
}

export interface ApmReliabilityResponse {
  fleet?: ApmFleetReliability;
  reliability?: ApmFleetReliability;
  assets?: ApmAssetDto[];
  meta?: ApmMeta;
}

export interface ApmCostResponse {
  assets?: Array<Record<string, unknown>>;
  economics?: ApmEconomics;
  meta?: ApmMeta;
}

export interface ApmCriticalityResponse {
  assets?: ApmAssetDto[];
  distribution?: ApmClassCountDto[];
  meta?: ApmMeta;
}

/* ─── Downstream contract ────────────────────────────────────────────────── */

/**
 * What APM publishes for OEE.
 *
 * Kept as its own named type even though nothing in this application consumes
 * it yet: it is the seam the OEE module will be built against, and writing it
 * down is what stops the two teams discovering they disagreed at integration.
 */
export interface ApmOeeInputs {
  assets?: Array<{
    asset_id: string;
    availability_pct: number;
    health_index: number;
    mtbf_hours: number;
    mttr_minutes: number;
    downtime_hours: number;
    failure_rate_per_1000h: number;
    criticality_score?: number;
    utilisation_pct?: number;
    [key: string]: unknown;
  }>;
  fleet?: Record<string, number | string>;
  meta?: ApmMeta;
}

/** Convenience alias — the dashboard reads the overview payload wholesale. */
export type ApmOverview = ApmOverviewDto;
