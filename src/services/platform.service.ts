import type {
  AnomalyResponseDto,
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
} from '@/types/api';
import { get, post } from './http';

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

export const assetService = {
  list: (query: AssetQuery = {}, options: Signal = {}) =>
    get<AssetListDto>('/assets', query as Record<string, unknown>, options),
  detail: (assetId: string, options: Signal = {}) =>
    get<AssetDetailDto>(`/assets/${encodeURIComponent(assetId)}`, undefined, options),
  components: (assetId: string, options: Signal = {}) =>
    get<Record<string, unknown>>(`/assets/${encodeURIComponent(assetId)}/components`, undefined, options),
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
};
