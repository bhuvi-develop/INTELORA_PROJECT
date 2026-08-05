import { Contrast, Cog, Database, Gauge, KeyRound, LayoutGrid, Radio, Server, ShieldCheck, BookOpen, Activity } from 'lucide-react';
import type { LiveWindow } from '@/types';
import { APP, env, grafanaEnabled } from '@/config/env';
import { MODULE_TITLES } from '@/config/navigation';
import { TICK_MS, WEAR_TIME_SCALE } from '@/engine/catalog';
import { OEE_TARGET } from '@/engine/derive';
import { useEngineControl, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { useAuth, useUI } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import type { Density } from '@/context/contexts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
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
  const { density, setDensity, liveWindow, setLiveWindow } = useUI();
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
                { value: 1000, label: '1s (Live)' },
                { value: 5000, label: '5s' },
                { value: 15000, label: '15s' },
                { value: 30000, label: '30s' },
              ]}
              value={streamIntervalMs}
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



        {/* ─── System Guide & Directory ─────────────────────────────────────────── */}
        <Card className="xl:col-span-2 bg-gradient-to-br from-ink-900 to-ink-950 border-overlay/[0.08]">
          <CardHeader
            title="System Guide & Application Directory"
            subtitle="Full architectural view of INTELORA application modules and capabilities"
            eyebrow="Documentation"
            icon={BookOpen}
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Enterprise Cockpit',
                desc: 'High-level executive dashboard tracking total assets, healthy/critical ratios, and active alerts.',
                icon: LayoutGrid,
              },
              {
                name: 'OEE Hub (Operations)',
                desc: 'Overall Equipment Effectiveness. Tracks Availability, Performance, and Quality metrics for the fleet.',
                icon: Gauge,
              },
              {
                name: 'APM Intelligence',
                desc: 'Asset Performance Management. Deep dive into asset health, critical risks, maintenance, and ROI.',
                icon: Server,
              },
              {
                name: 'Anomaly Detection',
                desc: 'Machine-learning engine that identifies unusual voltage, temperature, or current spikes in real-time.',
                icon: Activity,
              },
              {
                name: 'Alerts & Journal',
                desc: 'Centralized log of all threshold breaches, AI notifications, and system warnings across the fleet.',
                icon: ShieldCheck,
              },
              {
                name: 'Settings & Identity',
                desc: 'Configure telemetry stream, UI themes, notification preferences, and view account roles.',
                icon: Cog,
              },
            ].map((module) => (
              <div key={module.name} className="flex gap-4 items-start p-4 rounded-xl border border-overlay/[0.06] bg-ink-850/30 hover:bg-ink-850/60 transition-colors shadow-sm">
                <div className="p-2.5 rounded-lg bg-brand-500/10 text-brand-400 shrink-0">
                  <module.icon size={18} />
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-fg tracking-tight">{module.name}</h4>
                  <p className="text-[11.5px] text-fg-dim mt-1.5 leading-relaxed">{module.desc}</p>
                </div>
              </div>
            ))}
          </div>
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
