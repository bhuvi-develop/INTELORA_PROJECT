import {
  Contrast,
  Cog,
  Database,
  Gauge,
  KeyRound,
  LayoutGrid,
  Radio,
  Server,
  ShieldCheck,
  ClipboardList,
  BookOpen,
  Activity,
} from 'lucide-react';
import {
  Contrast,
  Cog,
  Database,
  Gauge,
  KeyRound,
  LayoutGrid,
  Radio,
  Server,
  ShieldCheck,
  ClipboardList,
  BookOpen,
  Activity,
} from 'lucide-react';

import type { LiveWindow } from '@/types';
import { APP } from '@/config/env';
import { MODULE_TITLES } from '@/config/navigation';
import type { LiveWindow } from '@/types';
import { APP } from '@/config/env';
import { MODULE_TITLES } from '@/config/navigation';
import { TICK_MS, WEAR_TIME_SCALE } from '@/engine/catalog';
import { useEngineControl, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { useAuth, useUI } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import type { Density } from '@/context/contexts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';

import { LiveIndicator, MetaStat, PageHeader } from '@/components/common';

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="text-[12px] text-fg-muted">{label}</dt>
    <dd className="shrink-0 truncate font-mono text-[11.5px] text-fg-soft">{value}</dd>
  </div>
);

const WINDOW_OPTIONS: Array<{ value: LiveWindow; label: string }> = [
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
];

export const SettingsPage = () => {
  const { user } = useAuth();
  const { density, setDensity, liveWindow, setLiveWindow, sidebarCollapsed, setSidebarCollapsed } = useUI();
  const { theme, setTheme } = useTheme();
  const { running, toggle, step, tick, streamIntervalMs, setStreamIntervalMs } = useEngineControl();
  const { platform, kpis, elapsedDays } = useSnapshot();

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.settings.title}
        subtitle={MODULE_TITLES.settings.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={ShieldCheck}>
              {user?.roleLabel ?? 'Operator'}
            </Badge>
            <Badge tone="neutral" size="sm">
              {APP.name} v{APP.version}
            </Badge>
            <Badge tone={running ? 'good' : 'warning'} size="sm" dot>
              {running ? 'Stream running' : 'Stream paused'}
            </Badge>
          </>
        }
        meta={
          <>
            <MetaStat label="Devices" value={formatNumber(kpis.totalAssets)} />
            <MetaStat label="Reporting" value={`${kpis.onlineAssets + kpis.standbyAssets}/${kpis.totalAssets}`} />
            <MetaStat label="Ticks elapsed" value={formatNumber(tick)} />
            <MetaStat label="Platform uptime" value={formatPercent(platform.uptimePct, 3)} />
          </>
        }
        actions={<LiveIndicator showTick />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ─── Interface ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Interface preferences"
            subtitle="Applied immediately and persisted to this browser"
            eyebrow="Personal"
            icon={Cog}
          />

          <div className="mt-5 space-y-5">
            <div>
              <p className="text-[12.5px] font-medium text-fg">Appearance</p>
              <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-fg-dim">
                Two independently designed themes, not an inversion of one another. Each has its own surface ramp,
                elevation language and chart palette, both validated for contrast and colour-vision separation against
                their own background. Your choice is remembered across refreshes.
              </p>
              <Segmented
                ariaLabel="Appearance"
                layoutId="settings-theme"
                className="mt-2.5"
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
                value={theme}
                onChange={(value) => setTheme(value as typeof theme)}
              />
            </div>

            <div>
              <p className="text-[12.5px] font-medium text-fg">Table density</p>
              <p className="mt-1 text-[11px] text-fg-dim">
                Compact fits roughly a third more rows per screen on dense registers.
              </p>
              <Segmented
                ariaLabel="Table density"
                layoutId="settings-density"
                className="mt-2.5"
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
                value={density}
                onChange={(value) => setDensity(value as Density)}
              />
            </div>

            <div>
              <p className="text-[12.5px] font-medium text-fg">Default streaming window</p>
              <p className="mt-1 text-[11px] text-fg-dim">
                How much history the live telemetry charts show by default.
              </p>
              <Segmented
                ariaLabel="Default streaming window"
                layoutId="settings-window"
                className="mt-2.5"
                options={WINDOW_OPTIONS}
                value={liveWindow}
                onChange={setLiveWindow}
              />
            </div>

            <div className="border-t border-overlay/[0.06] pt-4">
              <Switch
                checked={sidebarCollapsed}
                onChange={setSidebarCollapsed}
                label="Collapse navigation by default"
                description="Keeps the icon rail only, giving module content the full viewport width."
              />
            </div>
          </div>
        </Card>

        {/* ─── Simulation control ───────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Telemetry stream"
            subtitle="Control and calibration of the live device simulator"
            eyebrow="Simulation"
            icon={Radio}
          />

          <dl className="mt-4 divide-y divide-overlay/[0.045]">
            <Row label="Sample interval" value={`${TICK_MS / 1000} s (backend)`} />
            <Row label="Ticks elapsed" value={String(tick)} />
            <Row label="Service life consumed" value={`${formatNumber(elapsedDays, 2)} days`} />
            <Row label="Wear clock multiplier" value={`${WEAR_TIME_SCALE}×`} />
            <Row label="Stream state" value={running ? 'running' : 'paused'} />
          </dl>

          <div className="mt-5 border-t border-overlay/[0.06] pt-4">
            <p className="text-[12.5px] font-medium text-fg">Stream polling interval</p>
            <p className="mt-1 text-[11px] text-fg-dim">
              How frequently the interface pulls new data from the backend.
            </p>
              <Segmented
                ariaLabel="Stream interval"
                layoutId="settings-stream-interval"
                className="mt-2.5"
                options={[
                  { value: '1000', label: '1s (Live)' },
                  { value: '5000', label: '5s' },
                  { value: '15000', label: '15s' },
                  { value: '30000', label: '30s' },
                ]}
                value={String(streamIntervalMs)}
                onChange={(val) => setStreamIntervalMs(Number(val))}
              />

          </div>

          <p className="mt-4 rounded-xl border border-overlay/[0.07] bg-ink-850/50 p-3.5 text-[11px] leading-relaxed text-fg-dim">
            Every channel is a mean-reverting process seeded from the device identity and tick index, so the stream is
            reproducible: the same tick always yields the same reading. Degradation runs on an accelerated clock —{' '}
            {WEAR_TIME_SCALE}× wall time — so condition moves visibly within a session while remaining useful life still
            falls gradually.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-overlay/[0.06] pt-4">
            <Button variant={running ? 'secondary' : 'primary'} size="sm" onClick={toggle}>
              {running ? 'Pause stream' : 'Resume stream'}
            </Button>
            <Button variant="ghost" size="sm" onClick={step} disabled={running}>
              Advance one tick
            </Button>
            <span className="text-[10.5px] text-fg-faint">
              {running ? 'Pause to step through ticks manually' : 'Stepping advances every device by one sample'}
            </span>
          </div>
        </Card>



        {/* ─── Integrations ────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Integrations"
            subtitle="Where the platform reads data and renders historical analysis"
            eyebrow="Platform"
            icon={Database}
            actions={
              <Badge tone={grafanaEnabled ? 'good' : 'neutral'} size="xs" dot>
                {grafanaEnabled ? 'Grafana configured' : 'Grafana not configured'}
              </Badge>
            }
          />

          <dl className="mt-4 divide-y divide-overlay/[0.045]">
            <Row label="API base URL" value={env.apiBaseUrl} />
            <Row label="Grafana base URL" value={grafanaEnabled ? env.grafana.baseUrl : 'not set'} />
            <Row label="Grafana theme" value={env.grafana.theme} />
            <Row label="Effectiveness target" value={`${OEE_TARGET}%`} />
            <Row label="Session storage key" value={env.session.storageKey} />
          </dl>

          <p className="mt-4 rounded-xl border border-overlay/[0.07] bg-ink-850/50 p-3.5 text-[11px] leading-relaxed text-fg-dim">
            Live telemetry is a streaming concern served by the in-app engine, not a request cache. Authentication and
            archive queries travel over the REST gateway. Point{' '}
            <code className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono text-[10.5px]">VITE_GRAFANA_BASE_URL</code> at
            a Grafana instance to activate the embedded historical panels.
          </p>
        </Card>

        {/* ─── Release Notes ────────────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Release Notes"
            subtitle="Recent updates and improvements to the Intelora platform"
            eyebrow="Changelog"
            icon={ClipboardList}
          />

          <div className="mt-5 space-y-6">
            <div>
              <h4 className="text-[13px] font-semibold text-fg">1. UI Decluttering & Refinement</h4>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-fg-dim list-disc ml-4">
                <li><strong className="text-fg-soft">Removed the AI Copilot Panel:</strong> Stripped out the bulky "Intelora Reliability Copilot" from the APM page to give the analytics dashboard a cleaner look.</li>
                <li><strong className="text-fg-soft">Removed the Identity Card:</strong> Completely removed the "Account and access" identity card from the SettingsPage.</li>
                <li><strong className="text-fg-soft">Removed "Fleet Health" Workspace:</strong> Removed the redundant Fleet Health card from the Explore Workspaces grid (OeeHub) so it strictly focuses on the core 4 analytical modules.</li>
                <li><strong className="text-fg-soft">Cleaned up Navigation:</strong> Removed duplicate "Back to Asset Performance" buttons across the APM module to rely entirely on the cleaner breadcrumb and tab navigation.</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-fg">2. Architectural & Layout Fixes</h4>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-fg-dim list-disc ml-4">
                <li><strong className="text-fg-soft">Fixed the Hierarchy Tree Layout:</strong> Re-architected ApmAssetsPage so that the ApmHierarchyTree mounts cleanly inside the established page header frame, rather than pushing the entire page layout downward.</li>
                <li><strong className="text-fg-soft">Stabilized the Real-Time Clock:</strong> Refactored the LiveIndicator clock. It now runs on its own continuous interval, meaning the UI clock will no longer "freeze" when you pause the telemetry simulation engine.</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-fg">3. Data Transparency & OEE Integration</h4>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-fg-dim list-disc ml-4">
                <li><strong className="text-fg-soft">Wired up True OEE Data:</strong> Updated the ExecutiveOverviewPanel to pull the actual Availability, Performance, and Quality data directly from the Python backend instead of relying on the old hardcoded placeholder values (87.5% and 96.2%).</li>
                <li><strong className="text-fg-soft">Session Intelligence Transparency:</strong> Added a clear information banner to the SessionIntelligencePanel explaining exactly how the session metrics (Today's Sessions, Success Rate) are mathematically simulated based on the asset count.</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-fg">4. User-Adjustable Telemetry Stream</h4>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-fg-dim list-disc ml-4">
                <li><strong className="text-fg-soft">Unified Polling Intervals:</strong> Replaced the separate, hardcoded livePollMs and analyticsPollMs in the environment config with a single streamIntervalMs.</li>
                <li><strong className="text-fg-soft">Added UI Controls:</strong> Added a new control in the SettingsPage allowing you to dynamically adjust how fast the UI polls the backend (1s, 5s, 15s, or 30s) based on your network needs.</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* ─── Platform services ───────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Platform services"
            subtitle="Live state of the services backing the platform"
            eyebrow="Infrastructure"
            icon={Server}
          />

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {platform.services.map((service) => (
              <div key={service.key} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] font-medium text-fg-soft">{service.name}</span>
                  <span
                    className={
                      service.state === 'Operational'
                        ? 'text-[10px] font-medium text-emerald-300'
                        : 'text-[10px] font-medium text-amber-300'
                    }
                  >
                    {service.state}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold tabular-nums text-fg">
                  {service.latencyMs !== null ? `${service.latencyMs} ms` : '—'}
                </p>
                <p className="mt-0.5 text-[9.5px] tabular-nums text-fg-faint">
                  {formatPercent(service.uptimePct, 3)} uptime
                </p>
              </div>
            ))}
          </div>

          <dl className="mt-4 grid gap-x-8 border-t border-overlay/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Product" value={`${APP.name} ${APP.tagline}`} />
            <Row label="Version" value={APP.version} />
            <Row label="Build" value={APP.build} />
            <Row label="Vendor" value={APP.vendor} />
            <Row label="API response" value={`${platform.apiResponseMs} ms`} />
            <Row label="Database latency" value={`${platform.databaseLatencyMs} ms`} />
          </dl>
        </Card>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-overlay/[0.07] bg-ink-850/40 px-4 py-3">
        <Contrast size={14} className="shrink-0 text-fg-dim" aria-hidden />
        <p className="text-[11px] leading-relaxed text-fg-dim">
          Authentication is currently bypassed and the platform opens directly onto the dashboard. The session shown here
          is a standing operator identity; sign-in will be reinstated without changes to any module.
        </p>
      </div>

      <div className="flex items-center gap-2 text-[10.5px] text-fg-faint">
        <LayoutGrid size={12} aria-hidden />
        <span>
          Detection thresholds live with each device profile in the engine, so a charger at 19.8 V and a UPS at 230 V are
          each judged against their own tolerance rather than a global constant.
        </span>
        <Gauge size={12} className="ml-auto shrink-0" aria-hidden />
      </div>
    </div>
  );
};
