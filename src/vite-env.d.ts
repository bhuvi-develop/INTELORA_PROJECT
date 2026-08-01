/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_MOCK_LATENCY_MIN?: string;
  readonly VITE_MOCK_LATENCY_MAX?: string;
  readonly VITE_GRAFANA_BASE_URL?: string;
  readonly VITE_GRAFANA_ORG_ID?: string;
  readonly VITE_GRAFANA_KIOSK?: string;
  readonly VITE_GRAFANA_THEME?: string;
  readonly VITE_GRAFANA_DASHBOARD_TELEMETRY?: string;
  readonly VITE_GRAFANA_DASHBOARD_ANOMALY?: string;
  readonly VITE_GRAFANA_DASHBOARD_PREDICTIVE?: string;
  readonly VITE_GRAFANA_DASHBOARD_APM?: string;
  readonly VITE_GRAFANA_DASHBOARD_OEE?: string;
  readonly VITE_SESSION_IDLE_MINUTES?: string;
  readonly VITE_LIVE_POLL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
