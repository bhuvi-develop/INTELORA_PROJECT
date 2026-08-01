import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry authorisation or missing-resource failures.
        if (isApiError(error) && [400, 401, 403, 404].includes(error.status)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Centralised cache keys — every hook derives its key from this map. */
export const queryKeys = {
  fleetSummary: ['fleet', 'summary'] as const,
  businessSummary: ['fleet', 'business-summary'] as const,
  facets: ['fleet', 'facets'] as const,
  topAssets: (limit: number) => ['fleet', 'top-assets', limit] as const,
  attentionAssets: (limit: number) => ['fleet', 'attention-assets', limit] as const,
  assets: (query: unknown) => ['assets', 'list', query] as const,
  asset: (id: string) => ['assets', 'detail', id] as const,
  assetTelemetry: (id: string, range: string) => ['assets', 'telemetry', id, range] as const,
  assetAnomalies: (id: string) => ['assets', 'anomalies', id] as const,
  fleetTelemetry: (range: string) => ['telemetry', 'fleet', range] as const,
  energyBySite: (range: string) => ['telemetry', 'energy-by-site', range] as const,
  anomalySummary: ['anomalies', 'summary'] as const,
  anomalies: (query: unknown) => ['anomalies', 'list', query] as const,
  alerts: (limit: number) => ['alerts', limit] as const,
  predictiveSummary: ['predictive', 'summary'] as const,
  predictions: (tier: string) => ['predictive', 'predictions', tier] as const,
  prediction: (assetId: string) => ['predictive', 'prediction', assetId] as const,
  apmSummary: ['apm', 'summary'] as const,
  apmRecords: ['apm', 'records'] as const,
  apmRecord: (assetId: string) => ['apm', 'record', assetId] as const,
  oeeSummary: ['oee', 'summary'] as const,
  oeeRecords: ['oee', 'records'] as const,
  oeeLines: ['oee', 'lines'] as const,
  oeeRecord: (assetId: string) => ['oee', 'record', assetId] as const,
  aiPanel: (module: string) => ['ai', 'panel', module] as const,
  aiInsights: (limit: number) => ['ai', 'insights', limit] as const,
  notifications: ['platform', 'notifications'] as const,
  platformHealth: ['platform', 'health'] as const,
};
