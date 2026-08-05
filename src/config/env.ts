const bool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
};

const int = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (raw: string | undefined, fallback: string): string =>
  raw === undefined || raw === '' ? fallback : raw;

export const env = {
  /** FastAPI service. Every figure the interface renders comes from here. */
  apiBaseUrl: str(import.meta.env.VITE_API_BASE_URL, 'http://localhost:8000/api'),
  requestTimeoutMs: int(import.meta.env.VITE_REQUEST_TIMEOUT_MS, 20_000),
  /** Prefer the websocket for the live stream, falling back to polling. */
  useWebsocket: bool(import.meta.env.VITE_USE_WEBSOCKET, true),
  grafana: {
    baseUrl: str(import.meta.env.VITE_GRAFANA_BASE_URL, ''),
    orgId: int(import.meta.env.VITE_GRAFANA_ORG_ID, 1),
    kiosk: str(import.meta.env.VITE_GRAFANA_KIOSK, '1'),
    theme: str(import.meta.env.VITE_GRAFANA_THEME, 'dark') as 'dark' | 'light',
    dashboards: {
      telemetry: str(import.meta.env.VITE_GRAFANA_DASHBOARD_TELEMETRY, 'mikos-telemetry/mikos-telemetry'),
      anomaly: str(import.meta.env.VITE_GRAFANA_DASHBOARD_ANOMALY, 'mikos-anomaly/mikos-anomaly-detection'),
      predictive: str(
        import.meta.env.VITE_GRAFANA_DASHBOARD_PREDICTIVE,
        'mikos-rul/mikos-predictive-maintenance',
      ),
      apm: str(import.meta.env.VITE_GRAFANA_DASHBOARD_APM, 'mikos-apm/mikos-asset-performance'),
      oee: str(import.meta.env.VITE_GRAFANA_DASHBOARD_OEE, 'mikos-oee/mikos-overall-equipment-effectiveness'),
    },
  },
  session: {
    idleMinutes: int(import.meta.env.VITE_SESSION_IDLE_MINUTES, 30),
    storageKey: 'intelora.session',
    preferencesKey: 'intelora.preferences',
  },
<<<<<<< Updated upstream
  /** Live telemetry poll interval, used when the websocket is unavailable. */
  livePollMs: int(import.meta.env.VITE_LIVE_POLL_MS, 1_000),
  /** Cadence for the derived views — effectiveness and predictions move slowly. */
  analyticsPollMs: int(import.meta.env.VITE_ANALYTICS_POLL_MS, 15_000),
=======
  /** Unified stream interval for all live and analytics telemetry (user adjustable) */
  streamIntervalMs: int(import.meta.env.VITE_STREAM_INTERVAL_MS, 1_000),
>>>>>>> Stashed changes
} as const;

/** True when Grafana embedding is configured; drives the offline fallback panel. */
export const grafanaEnabled = env.grafana.baseUrl.trim().length > 0;

export const APP = {
  name: 'INTELORA',
  tagline: 'Enterprise AIoT Intelligence',
  device: 'MIKOS Smart Energy Sensor',
  vendor: 'Intelora Industrial Systems',
  version: '1.0.0',
  build: '2026.07.31',
} as const;
