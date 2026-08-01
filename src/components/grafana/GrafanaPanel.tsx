import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Loader2, PlugZap, RefreshCw } from 'lucide-react';
import type { GrafanaPanelConfig } from '@/types';
import { grafanaEnabled } from '@/config/env';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/Button';
import { buildGrafanaDashboardUrl, buildGrafanaUrl } from './grafanaUrl';

export interface GrafanaPanelProps extends GrafanaPanelConfig {
  subtitle?: string;
  height?: number;
  className?: string;
  /** Rendered in place of the iframe when Grafana is not configured. */
  fallback?: ReactNode;
  /** Hide the card chrome and render only the frame. */
  bare?: boolean;
}

type FrameState = 'loading' | 'ready' | 'error';

const OfflineNotice = ({ height, dashboard, panelId }: { height: number; dashboard: string; panelId: number }) => (
  <div
    className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-overlay/[0.11] bg-ink-850/50 px-6 text-center"
    style={{ height }}
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-overlay/[0.04] text-fg-dim ring-1 ring-inset ring-overlay/[0.07]">
      <PlugZap size={18} aria-hidden />
    </span>
    <div>
      <p className="text-[12.5px] font-semibold text-fg-soft">Grafana endpoint not configured</p>
      <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-fg-dim">
        Set <code className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono text-[10.5px]">VITE_GRAFANA_BASE_URL</code> to
        embed live telemetry panels. This panel resolves to{' '}
        <span className="font-mono text-[10.5px] text-fg-muted">
          {dashboard} · panel {panelId}
        </span>
        .
      </p>
    </div>
  </div>
);

const ErrorNotice = ({ height, onRetry }: { height: number; onRetry: () => void }) => (
  <div
    className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-rose-400/25 bg-rose-500/[0.04] px-6 text-center"
    style={{ height }}
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/25">
      <AlertTriangle size={18} aria-hidden />
    </span>
    <div>
      <p className="text-[12.5px] font-semibold text-fg-soft">Panel could not be rendered</p>
      <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-fg-dim">
        The Grafana instance refused the embed. Verify that anonymous access or the embedding allow-list permits this
        origin.
      </p>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-overlay/[0.06] px-2.5 py-1.5 text-[11.5px] font-medium text-fg-soft ring-1 ring-inset ring-overlay/10 transition-colors hover:bg-overlay/[0.1]"
    >
      <RefreshCw size={12} aria-hidden />
      Retry
    </button>
  </div>
);

/**
 * Reusable Grafana embed. Supports dynamic dashboard identifiers, panel ids,
 * template variables, time ranges and refresh intervals, and degrades to an
 * explanatory panel when no Grafana instance is configured.
 */
export const GrafanaPanel = ({
  dashboard,
  panelId,
  title,
  subtitle,
  from,
  to,
  refresh,
  orgId,
  theme,
  kiosk,
  variables,
  height = 300,
  className,
  fallback,
  bare = false,
}: GrafanaPanelProps) => {
  const [state, setState] = useState<FrameState>('loading');
  const [nonce, setNonce] = useState(0);

  const config = useMemo<GrafanaPanelConfig>(
    () => ({ dashboard, panelId, from, to, refresh, orgId, theme, kiosk, variables }),
    [dashboard, panelId, from, to, refresh, orgId, theme, kiosk, variables],
  );

  const src = useMemo(() => buildGrafanaUrl(config), [config]);
  const deepLink = useMemo(() => buildGrafanaDashboardUrl(config), [config]);

  const retry = () => {
    setState('loading');
    setNonce((prev) => prev + 1);
  };

  const frame = (() => {
    if (!grafanaEnabled || !src) {
      return fallback ?? <OfflineNotice height={height} dashboard={dashboard} panelId={panelId} />;
    }
    if (state === 'error') return <ErrorNotice height={height} onRetry={retry} />;

    return (
      <div
        className="relative overflow-hidden rounded-xl border border-overlay/[0.07] bg-ink-850/60"
        style={{ height }}
      >
        {state === 'loading' ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-ink-850/70">
            <Loader2 size={15} className="animate-spin text-brand-300" aria-hidden />
            <span className="text-[11.5px] text-fg-dim">Rendering Grafana panel…</span>
          </div>
        ) : null}
        <iframe
          key={`${src}-${nonce}`}
          src={src}
          title={title ?? `Grafana panel ${panelId}`}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      </div>
    );
  })();

  if (bare) return <div className={className}>{frame}</div>;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={title ?? `Panel ${panelId}`}
        subtitle={subtitle}
        eyebrow="Grafana"
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone={grafanaEnabled ? 'brand' : 'neutral'} size="xs" dot>
              {grafanaEnabled ? 'Embedded' : 'Not configured'}
            </Badge>
            {grafanaEnabled ? (
              <IconButton icon={RefreshCw} label="Reload panel" size="xs" onClick={retry} />
            ) : null}
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Open dashboard in Grafana"
                title="Open dashboard in Grafana"
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg"
              >
                <ExternalLink size={13} aria-hidden />
              </a>
            ) : null}
          </div>
        }
      />
      <div className="mt-3.5">{frame}</div>
    </Card>
  );
};
