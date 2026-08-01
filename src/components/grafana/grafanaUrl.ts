import type { GrafanaPanelConfig } from '@/types';
import { env } from '@/config/env';

/**
 * Build a Grafana `d-solo` embed URL.
 *
 * Dashboard identifiers are given as `<uid>` or `<uid>/<slug>`; template
 * variables are emitted as repeated `var-<name>` parameters so multi-value
 * variables round-trip correctly.
 */
export const buildGrafanaUrl = (config: GrafanaPanelConfig): string | null => {
  const base = env.grafana.baseUrl.trim().replace(/\/+$/, '');
  if (base.length === 0) return null;

  const dashboard = config.dashboard.replace(/^\/+|\/+$/g, '');
  if (dashboard.length === 0) return null;

  const params = new URLSearchParams();
  params.set('orgId', String(config.orgId ?? env.grafana.orgId));
  params.set('panelId', String(config.panelId));
  params.set('theme', config.theme ?? env.grafana.theme);
  params.set('from', config.from ?? 'now-24h');
  params.set('to', config.to ?? 'now');

  const kiosk = config.kiosk ?? env.grafana.kiosk;
  if (kiosk) params.set('kiosk', kiosk);

  if (config.refresh) params.set('refresh', config.refresh);

  Object.entries(config.variables ?? {}).forEach(([name, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(`var-${name}`, String(entry)));
      return;
    }
    params.append(`var-${name}`, String(value));
  });

  return `${base}/d-solo/${dashboard}?${params.toString()}`;
};

/** Deep link to the full dashboard, for the "open in Grafana" affordance. */
export const buildGrafanaDashboardUrl = (config: GrafanaPanelConfig): string | null => {
  const base = env.grafana.baseUrl.trim().replace(/\/+$/, '');
  if (base.length === 0) return null;

  const dashboard = config.dashboard.replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams();
  params.set('orgId', String(config.orgId ?? env.grafana.orgId));
  params.set('from', config.from ?? 'now-24h');
  params.set('to', config.to ?? 'now');
  params.set('viewPanel', String(config.panelId));

  Object.entries(config.variables ?? {}).forEach(([name, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(`var-${name}`, String(entry)));
      return;
    }
    params.append(`var-${name}`, String(value));
  });

  return `${base}/d/${dashboard}?${params.toString()}`;
};

/** Map an application time range onto Grafana's relative-time syntax. */
export const grafanaRangeFrom = (range: string): string => {
  switch (range) {
    case '1h':
      return 'now-1h';
    case '6h':
      return 'now-6h';
    case '24h':
      return 'now-24h';
    case '7d':
      return 'now-7d';
    case '30d':
      return 'now-30d';
    case '90d':
      return 'now-90d';
    default:
      return 'now-24h';
  }
};
