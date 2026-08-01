import { Activity, Database, Server, ShieldCheck, Timer } from 'lucide-react';
import { SERVICE_STATE_TONE } from '@/engine/platform';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';

/* ───────────────────────────────────────────────────────────────────────────
 * Platform health.
 *
 * Live state of the services the product depends on, so an operator can tell a
 * device problem from a platform problem before escalating either.
 * ─────────────────────────────────────────────────────────────────────────── */

const Metric = ({
  icon: Icon,
  label,
  value,
  caption,
  tone = 'neutral',
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  caption: string;
  tone?: 'good' | 'warning' | 'neutral';
}) => (
  <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
    <span
      className={cn(
        'flex items-center gap-1.5',
        tone === 'good' ? 'text-emerald-300' : tone === 'warning' ? 'text-amber-300' : 'text-brand-300',
      )}
    >
      <Icon size={12} aria-hidden />
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{label}</span>
    </span>
    <p className="mt-1.5 text-[15px] font-semibold leading-none tabular-nums text-fg">{value}</p>
    <p className="mt-1 text-[9.5px] leading-snug text-fg-faint">{caption}</p>
  </div>
);

export const PlatformHealthPanel = ({ className }: { className?: string }) => {
  const { platform } = useSnapshot();

  const degraded = platform.services.filter((service) => service.state !== 'Operational').length;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Platform health"
        subtitle="Services backing the platform, with response times and uptime"
        eyebrow="Infrastructure"
        icon={Server}
        actions={
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium ring-1 ring-inset',
              degraded === 0
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
                : 'bg-amber-500/10 text-amber-300 ring-amber-400/25',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {degraded === 0 ? 'All operational' : `${degraded} degraded`}
          </span>
        }
      />

      <ul className="mt-4 space-y-1.5">
        {platform.services.map((service) => {
          const tone = SERVICE_STATE_TONE[service.state];
          return (
            <li key={service.key}>
              <Tooltip content={<span className="block leading-relaxed">{service.role}</span>}>
                <div className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-overlay/[0.03]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tone.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg-soft">{service.name}</span>
                  {service.latencyMs !== null ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-fg-dim">{service.latencyMs} ms</span>
                  ) : null}
                  <span className={cn('w-20 shrink-0 text-right text-[11px] font-medium', tone.text)}>
                    {service.state}
                  </span>
                </div>
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-overlay/[0.06] pt-4 lg:grid-cols-4">
        <Metric
          icon={Timer}
          label="API response"
          value={`${formatNumber(platform.apiResponseMs)} ms`}
          caption="Gateway round trip"
          tone={platform.apiResponseMs < 120 ? 'good' : 'warning'}
        />
        <Metric
          icon={Database}
          label="DB latency"
          value={`${formatNumber(platform.databaseLatencyMs)} ms`}
          caption="Query round trip"
          tone={platform.databaseLatencyMs < 40 ? 'good' : 'warning'}
        />
        <Metric
          icon={ShieldCheck}
          label="Uptime"
          value={formatPercent(platform.uptimePct, 3)}
          caption="Rolling 30-day mean"
          tone="good"
        />
        <Metric
          icon={Activity}
          label="Ingest"
          value={`${formatNumber(platform.ingestPerMinute)}/min`}
          caption={`${platform.sensorsConnected}/${platform.sensorsTotal} sensors`}
          tone="neutral"
        />
      </div>
    </Card>
  );
};
