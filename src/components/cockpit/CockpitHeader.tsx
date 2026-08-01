import { Cable, CalendarDays, Clock, Radio, Signal } from 'lucide-react';
import { APP } from '@/config/env';
import { useEngineControl, useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatClock, formatNumber } from '@/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { LogoMark } from '@/components/common/Logo';

/* ───────────────────────────────────────────────────────────────────────────
 * Cockpit header.
 *
 * Carries the cockpit's own identity and situational strip: organisation, date,
 * time, gateway state and connected sensor count. Global search, the
 * notification centre, the profile menu, settings and the theme toggle live in
 * the persistent top bar directly above, where they stay reachable from every
 * module — duplicating them here would be clutter for no gain.
 * ─────────────────────────────────────────────────────────────────────────── */

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const Stat = ({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  tooltip,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: 'good' | 'warning' | 'neutral';
  tooltip: string;
}) => (
  <Tooltip content={<span className="block leading-relaxed">{tooltip}</span>}>
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-overlay/[0.06] bg-ink-850/50 px-3 py-2">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
          tone === 'good'
            ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
            : tone === 'warning'
              ? 'bg-amber-500/10 text-amber-300 ring-amber-400/25'
              : 'bg-brand-500/10 text-brand-300 ring-brand-400/20',
        )}
      >
        <Icon size={13} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-faint">{label}</p>
        <p className="mt-0.5 truncate text-[12px] font-semibold tabular-nums text-fg">{value}</p>
      </div>
    </div>
  </Tooltip>
);

export const CockpitHeader = ({ className }: { className?: string }) => {
  const { user } = useAuth();
  const { platform, kpis } = useSnapshot();
  const { at, running } = useEngineControl();

  return (
    <Card className={cn('relative overflow-hidden', className)} sheen>
      {/* Brand wash behind the identity block. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 0% 0%, rgba(61,142,240,0.09), transparent 65%)' }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative shrink-0">
            <span className="absolute inset-0 -z-10 rounded-2xl bg-brand-500/25 blur-xl" aria-hidden />
            <LogoMark size={46} animated={running} />
          </span>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-300">{APP.name}</p>
            <h1 className="mt-1 text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[1.75rem]">
              Enterprise Cockpit
            </h1>
            <p className="mt-1.5 truncate text-[12px] text-fg-muted">
              {user?.organisation ?? APP.vendor}
              <span className="mx-1.5 text-fg-faint">·</span>
              Operational command and intelligence centre
            </p>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat
            icon={CalendarDays}
            label="Date"
            value={dateFmt.format(new Date(at))}
            tooltip="Current platform date, taken from the streaming clock"
          />
          <Stat
            icon={Clock}
            label="Time"
            value={formatClock(at)}
            tone={running ? 'good' : 'warning'}
            tooltip={
              running
                ? 'Platform clock, advancing with the live telemetry stream'
                : 'Stream is paused — the clock holds at the last sample'
            }
          />
          <Stat
            icon={platform.gatewayConnected ? Cable : Signal}
            label="Gateway"
            value={platform.gatewayConnected ? 'Connected' : 'Disconnected'}
            tone={platform.gatewayConnected ? 'good' : 'warning'}
            tooltip="Edge gateway session state. The gateway aggregates device telemetry and forwards it to the platform."
          />
          <Stat
            icon={Radio}
            label="Sensors"
            value={`${formatNumber(platform.sensorsConnected)}/${formatNumber(platform.sensorsTotal)}`}
            tone={platform.sensorsConnected === platform.sensorsTotal ? 'good' : 'warning'}
            tooltip={`${platform.sensorsConnected} of ${platform.sensorsTotal} devices are delivering samples. ${kpis.offlineAssets} unreachable.`}
          />
        </div>
      </div>
    </Card>
  );
};
