import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Cog,
  Cpu,
  History,
  PlugZap,
  Radio,
  WifiOff,
} from 'lucide-react';
import type { ActivityKind } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatClock, formatRelative } from '@/utils/format';
import { deviceDetailPath } from '@/routes/paths';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/* ───────────────────────────────────────────────────────────────────────────
 * Operational activity timeline.
 *
 * Device connectivity changes, alerts and maintenance sign-offs are journalled
 * by the engine at the moment the state actually changes, so this is a record of
 * what happened rather than a decorative feed. Newest first.
 * ─────────────────────────────────────────────────────────────────────────── */

const KIND_ICON: Record<ActivityKind, typeof Radio> = {
  'asset-connected': PlugZap,
  'asset-offline': WifiOff,
  'gateway-connected': Cable,
  'gateway-disconnected': Cable,
  'telemetry-received': Radio,
  'alert-generated': AlertTriangle,
  'maintenance-completed': CheckCircle2,
  'firmware-updated': Cpu,
  'configuration-changed': Cog,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  'asset-connected': 'Asset connected',
  'asset-offline': 'Asset offline',
  'gateway-connected': 'Gateway connected',
  'gateway-disconnected': 'Gateway disconnected',
  'telemetry-received': 'Telemetry received',
  'alert-generated': 'Alert generated',
  'maintenance-completed': 'Maintenance completed',
  'firmware-updated': 'Firmware updated',
  'configuration-changed': 'Configuration changed',
};

export interface ActivityFeedProps {
  limit?: number;
  className?: string;
}

export const ActivityFeed = ({ limit = 10, className }: ActivityFeedProps) => {
  const { activity } = useSnapshot();
  const shown = activity.slice(0, limit);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Operational activity"
        subtitle="Platform and device events, newest first"
        eyebrow="Timeline"
        icon={History}
        actions={<span className="text-[10.5px] tabular-nums text-fg-faint">{activity.length} recorded</span>}
      />

      <div className="mt-4 flex-1">
        {shown.length === 0 ? (
          <EmptyState icon={History} compact title="No activity recorded yet" />
        ) : (
          <ol className="relative space-y-0">
            <span className="absolute bottom-3 left-[11px] top-3 w-px bg-overlay/[0.07]" aria-hidden />
            {shown.map((event) => {
              const Icon = KIND_ICON[event.kind];
              const tone = SEVERITY_TONE[event.severity];
              return (
                <li key={event.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                  <span
                    className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-4 ring-ink-800"
                    style={{ backgroundColor: `${tone.color}1F`, color: tone.color }}
                  >
                    <Icon size={12} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="min-w-0 text-[12px] font-semibold leading-snug text-fg">{event.title}</p>
                      <time
                        dateTime={new Date(event.at).toISOString()}
                        title={formatRelative(event.at)}
                        className="shrink-0 text-[10px] tabular-nums text-fg-faint"
                      >
                        {formatClock(event.at)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{event.detail}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded bg-overlay/[0.05] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em] text-fg-dim">
                        {KIND_LABEL[event.kind]}
                      </span>
                      {event.assetId ? (
                        <Link
                          to={deviceDetailPath(event.assetId)}
                          className="rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-[9.5px] text-brand-300 transition-colors hover:bg-brand-500/20"
                        >
                          {event.assetId}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
};
