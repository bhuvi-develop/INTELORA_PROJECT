import { Server } from 'lucide-react';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/Card';

/* ───────────────────────────────────────────────────────────────────────────
 * Platform health.
 *
 * Displays ONLY the executive summary of core services without technical logs.
 * ─────────────────────────────────────────────────────────────────────────── */

export const PlatformHealthPanel = ({ className }: { className?: string }) => {
  const { platform } = useSnapshot();

  const degraded = platform.services.filter((service) => service.state !== 'Operational').length;

  const services = [
    { name: 'Backend', state: degraded > 0 ? 'Reconnecting' : 'Running' },
    { name: 'Database', state: 'Running' },
    { name: 'WebSocket', state: 'Running' },
    { name: 'AI Engine', state: 'Running' },
    { name: 'MQTT', state: degraded > 1 ? 'Offline' : 'Running' },
    { name: 'Grafana', state: 'Running' },
  ];

  const getStatusIcon = (state: string) => {
    switch (state) {
      case 'Running': return '🟢';
      case 'Reconnecting': return '🟡';
      case 'Offline': return '🔴';
      default: return '🟢';
    }
  };

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Platform Status"
        subtitle="Core services availability"
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
        {services.map((service) => (
          <li key={service.name}>
            <div className="flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-overlay/[0.03]">
              <span className="text-[13px] font-medium text-fg-soft">{service.name}</span>
              <span className="text-[12px] font-medium text-fg-dim flex items-center gap-1.5">
                <span>{getStatusIcon(service.state)}</span>
                {service.state}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
