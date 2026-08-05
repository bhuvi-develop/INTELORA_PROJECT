import type {
  AnomalyResponseDto,
  ApmOverviewDto,
  ApmResponseDto,
  AssetDetailDto,
  AssetListDto,
  DailyRecordDto,
  DashboardDto,
  HistoryResponseDto,
  LiveTelemetryDto,
  OeeResponseDto,
  PredictionRecordDto,
  PredictiveResponseDto,
  PrescriptiveResponseDto,
  PreventiveResponseDto,
  SystemStatusDto,
  TelemetryWindowDto,
  MqttProfileDto,
  MqttProfilesResponseDto,
} from '@/types/api';
import { get, post, del } from './http';

/* ───────────────────────────────────────────────────────────────────────────
 * Platform services.
 *
 * One function per backend endpoint, grouped by the module it serves. Nothing
 * in here transforms, filters or computes — that is the adapter's job and the
 * backend's job respectively. These functions exist so that the set of URLs the
 * application knows about is enumerable by reading one file.
 *
 * Every function accepts an `AbortSignal` so an in-flight request can be
 * cancelled when the view that asked for it goes away.
 * ─────────────────────────────────────────────────────────────────────────── */

type Signal = { signal?: AbortSignal };

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

export const dashboardService = {
  /**
   * The whole executive view in one request.
   *
   * Deliberately a single call: a cockpit assembled from nine parallel requests
   * can render nine different instants of the estate, and the backend stamps
   * this payload with the tick it was computed from.
   */
  snapshot: (options: Signal = {}) => get<DashboardDto>('/dashboard', undefined, options),
  kpis: (options: Signal = {}) => get<{ kpis: DashboardDto['kpis'] }>('/dashboard/kpis', undefined, options),
};

/* ─── Assets ─────────────────────────────────────────────────────────────── */

export interface AssetQuery {
  category?: string;
  status?: string;
  band?: string;
}

export interface CreateAssetPayload {
  asset_id?: string;
  asset_name: string;
  category: string;
  brand: string;
  model: string;
  criticality: string;
  rated_power_w?: number;
  nominal_voltage_v?: number;
  duty_factor?: number;
}

export const assetService = {
  list: (query: AssetQuery = {}, options: Signal = {}) =>
    get<AssetListDto>('/assets', query as Record<string, unknown>, options),
  detail: (assetId: string, options: Signal = {}) =>
    get<AssetDetailDto>(`/assets/${encodeURIComponent(assetId)}`, undefined, options),
  components: (assetId: string, options: Signal = {}) =>
    get<Record<string, unknown>>(`/assets/${encodeURIComponent(assetId)}/components`, undefined, options),
  create: (payload: CreateAssetPayload, options: Signal = {}) =>
    post<Record<string, unknown>>('/assets', payload, options),
};

/* ─── Telemetry ──────────────────────────────────────────────────────────── */

export interface HistoryQuery {
  asset_id?: string;
  component?: string;
  hours?: number;
  start?: string;
  end?: string;
  resolution?: 'second' | 'minute' | 'quarter' | 'hour';
  limit?: number;
}

export const telemetryService = {
  live: (params: { asset_id?: string; category?: string } = {}, options: Signal = {}) =>
    get<LiveTelemetryDto>('/telemetry/live', params as Record<string, unknown>, options),
  /** The rolling window the detector and the models are reading. */
  window: (assetId: string, samples = 300, options: Signal = {}) =>
    get<TelemetryWindowDto>(
      `/telemetry/live/${encodeURIComponent(assetId)}/window`,
      { samples },
      options,
    ),
  history: (query: HistoryQuery, options: Signal = {}) =>
    get<HistoryResponseDto>('/telemetry/history', query as Record<string, unknown>, options),
  historySummary: (options: Signal = {}) =>
    get<Record<string, unknown>>('/telemetry/history/summary', undefined, options),
};

/* ─── Anomalies ──────────────────────────────────────────────────────────── */

export interface AnomalyQuery {
  asset_id?: string;
  severity?: string;
  status?: string;
  type?: string;
  category?: string;
  open_only?: boolean;
  limit?: number;
}

export const anomalyService = {
  list: (query: AnomalyQuery = {}, options: Signal = {}) =>
    get<AnomalyResponseDto>('/anomalies', query as Record<string, unknown>, options),
  definitions: (options: Signal = {}) =>
    get<Record<string, unknown>>('/anomalies/definitions', undefined, options),
  detail: (uid: string, options: Signal = {}) =>
    get<Record<string, unknown>>(`/anomalies/${encodeURIComponent(uid)}`, undefined, options),
  acknowledge: (uid: string) =>
    post<{ acknowledged: number }>(`/anomalies/${encodeURIComponent(uid)}/acknowledge`),
  acknowledgeAll: () => post<{ acknowledged: number; uids: string[] }>('/anomalies/acknowledge-all'),
};

/* ─── Maintenance ────────────────────────────────────────────────────────── */

export const maintenanceService = {
  predictive: (
    query: { asset_id?: string; category?: string; within_days?: number } = {},
    options: Signal = {},
  ) => get<PredictiveResponseDto>('/predictive', query as Record<string, unknown>, options),
  componentQueue: (limit = 25, options: Signal = {}) =>
    get<Record<string, unknown>>('/predictive/queue', { limit }, options),

  preventive: (
    query: { asset_id?: string; category?: string; status?: string; priority?: string } = {},
    options: Signal = {},
  ) => get<PreventiveResponseDto>('/preventive', query as Record<string, unknown>, options),
  completeTask: (taskId: string) =>
    post<{ task_id: string; completed: boolean }>(`/preventive/${encodeURIComponent(taskId)}/complete`),
  reopenTask: (taskId: string) =>
    post<{ task_id: string; completed: boolean }>(`/preventive/${encodeURIComponent(taskId)}/reopen`),

  prescriptive: (query: { urgency?: string; category?: string } = {}, options: Signal = {}) =>
    get<PrescriptiveResponseDto>('/prescriptive', query as Record<string, unknown>, options),
};

/* ─── Performance ────────────────────────────────────────────────────────── */

export const performanceService = {
  apm: (query: { category?: string } = {}, options: Signal = {}) =>
    get<ApmResponseDto>('/apm', query as Record<string, unknown>, options),
  comparison: (assetIds: string[], options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/comparison', { asset_ids: assetIds.join(',') }, options),
  oee: (query: { category?: string } = {}, options: Signal = {}) =>
    get<OeeResponseDto>('/oee', query as Record<string, unknown>, options),
  losses: (options: Signal = {}) => get<Record<string, unknown>>('/oee/losses', undefined, options),
};

/* ─── Asset Performance Management ───────────────────────────────────────── */

export interface ApmQuery {
  category?: string;
  /** Criticality class A, B, C or D. */
  criticality?: string;
  risk_tier?: string;
  /** Health index band. */
  band?: string;
  status?: string;
  /** priority, risk, health_index, health, criticality, exposure or asset_id. */
  sort?: string;
}

/**
 * The APM module's own projection.
 *
 * `overview` is a single call by design, for the same reason the dashboard is: a
 * view assembled from eight parallel requests can render eight different instants
 * of the estate, and every figure in this payload is stamped with the analytics
 * tick it was computed from.
 *
 * Filtering is a query parameter rather than something applied to the response.
 * The backend returns aggregates over the filtered scope alongside the estate
 * roll-up, so a scoped view never has to average anything in the browser.
 *
 * The remaining APM endpoints — criticality, reliability, cost, risk, backlog,
 * effectiveness, hierarchy, work orders and the OEE and executive contracts — are
 * enumerated here so the surface is discoverable from this file, even where no
 * view reads them yet.
 */
export const apmService = {
  overview: (query: ApmQuery = {}, options: Signal = {}) =>
    get<ApmOverviewDto>('/apm/overview', query as Record<string, unknown>, options),
  asset: (assetId: string, options: Signal = {}) =>
    get<Record<string, unknown>>(`/apm/assets/${encodeURIComponent(assetId)}`, undefined, options),
  healthIndex: (query: { category?: string } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/health-index', query as Record<string, unknown>, options),
  criticality: (options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/criticality', undefined, options),
  reliability: (query: { category?: string } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/reliability', query as Record<string, unknown>, options),
  risk: (query: { tier?: string } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/risk', query as Record<string, unknown>, options),
  cost: (options: Signal = {}) => get<Record<string, unknown>>('/apm/cost', undefined, options),
  backlog: (options: Signal = {}) => get<Record<string, unknown>>('/apm/backlog', undefined, options),
  effectiveness: (options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/effectiveness', undefined, options),
  hierarchy: (query: { depth?: number } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/hierarchy', query as Record<string, unknown>, options),
  history: (query: { asset_id?: string; days?: number } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/history', query as Record<string, unknown>, options),

  config: (options: Signal = {}) => get<Record<string, unknown>>('/apm/config', undefined, options),

  /* Contracts APM publishes downstream. */
  oeeInputs: (options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/outputs/oee', undefined, options),
  executiveOutputs: (options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/outputs/executive', undefined, options),
  outcomes: (query: { hours?: number; unpublished_only?: boolean } = {}, options: Signal = {}) =>
    get<Record<string, unknown>>('/apm/outcomes', query as Record<string, unknown>, options),

  /* Work orders. */
  workOrders: (
    query: {
      asset_id?: string;
      status?: string;
      priority?: string;
      type?: string;
      origin?: string;
      open_only?: boolean;
      overdue_only?: boolean;
      limit?: number;
    } = {},
    options: Signal = {},
  ) => get<Record<string, unknown>>('/apm/work-orders', query as Record<string, unknown>, options),
  workOrder: (id: string, options: Signal = {}) =>
    get<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}`, undefined, options),
  raiseWorkOrder: (payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>('/apm/work-orders', payload, options),
  approveWorkOrder: (id: string, payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}/approve`, payload, options),
  rejectWorkOrder: (id: string, payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}/reject`, payload, options),
  assignWorkOrder: (id: string, payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}/assign`, payload, options),
  completeWorkOrder: (id: string, payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}/complete`, payload, options),
  verifyWorkOrder: (id: string, payload: Record<string, unknown>, options: Signal = {}) =>
    post<Record<string, unknown>>(`/apm/work-orders/${encodeURIComponent(id)}/verify`, payload, options),
};

/* ─── Reports ────────────────────────────────────────────────────────────── */

export const reportService = {
  daily: (
    query: { days?: number; asset_id?: string; category?: string } = {},
    options: Signal = {},
  ) =>
    get<{ records: DailyRecordDto[]; count: number }>(
      '/reports/daily',
      query as Record<string, unknown>,
      options,
    ),
  predictions: (
    query: { days?: number; asset_id?: string; component?: string } = {},
    options: Signal = {},
  ) =>
    get<{ records: PredictionRecordDto[]; count: number }>(
      '/reports/predictions',
      query as Record<string, unknown>,
      options,
    ),
  summary: (options: Signal = {}) => get<Record<string, unknown>>('/reports/summary', undefined, options),
};

/* ─── System ─────────────────────────────────────────────────────────────── */

export const systemService = {
  status: (options: Signal = {}) => get<SystemStatusDto>('/system/status', undefined, options),
  refresh: () => post<Record<string, unknown>>('/system/refresh'),
  setSource: (source: string) => post<Record<string, unknown>>('/system/source', { source }),
  getMqttProfiles: () => get<MqttProfilesResponseDto>('/mqtt/profiles'),
  saveMqttProfile: (profile: MqttProfileDto) => post<{ status: string; profile: MqttProfileDto }>('/mqtt/profiles', profile),
  deleteMqttProfile: (name: string) => del<{ status: string; name: string }>(`/mqtt/profiles/${encodeURIComponent(name)}`),
  connectMqttProfile: (name: string) => post<{ status: string; active_profile: string; connected: boolean }>('/mqtt/connect', { name }),
  testMqttConnection: (host: string, port: number) => post<{ ok: boolean; message: string }>('/mqtt/test', { host, port }),
};
