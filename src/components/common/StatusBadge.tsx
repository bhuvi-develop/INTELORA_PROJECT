import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Clock,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import type {
  ActionUrgency,
  AnomalyStatus,
  DeviceStatus,
  HealthBand,
  Severity,
  TaskPriority,
  TaskStatus,
} from '@/engine/types';
import { STATUS_TONE, SEVERITY_TONE, TASK_PRIORITY_TONE, URGENCY_TONE, bandDef } from '@/engine/derive';
import { cn } from '@/lib/cn';

/* Every badge pairs its colour with a word, and most with an icon, so no state
 * is ever communicated by hue alone. Tones come from the engine's derivation
 * layer, which also owns the thresholds — a band and its colour cannot drift. */

const SHELL = 'inline-flex shrink-0 items-center gap-1.5 rounded-md ring-1 ring-inset font-medium';
const SIZE = { xs: 'h-5 px-1.5 text-[10.5px]', sm: 'h-6 px-2 text-[11.5px]' } as const;

type Size = keyof typeof SIZE;

const STATUS_ICON = { Online: Wifi, Standby: Moon, Offline: CircleOff } as const;

/** Connectivity state. Distinct from condition. */
export const StatusBadge = ({
  status,
  size = 'sm',
  className,
}: {
  status: DeviceStatus;
  size?: Size;
  className?: string;
}) => {
  const tone = STATUS_TONE[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <Icon size={size === 'xs' ? 10 : 12} aria-hidden />
      {status}
    </span>
  );
};

const BAND_ICON: Record<HealthBand, typeof CheckCircle2> = {
  healthy: ShieldCheck,
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

/** Condition band: Healthy 95+, Good 80–94, Warning 65–79, Critical below 65. */
export const HealthBandBadge = ({
  band,
  size = 'sm',
  showIcon = true,
  className,
}: {
  band: HealthBand;
  size?: Size;
  showIcon?: boolean;
  className?: string;
}) => {
  const def = bandDef(band);
  const Icon = BAND_ICON[band];
  return (
    <span className={cn(SHELL, SIZE[size], def.bg, def.text, def.ring, className)}>
      {showIcon ? <Icon size={size === 'xs' ? 10 : 12} aria-hidden /> : null}
      {def.label}
    </span>
  );
};

export const SeverityBadge = ({
  severity,
  size = 'sm',
  className,
}: {
  severity: Severity;
  size?: Size;
  className?: string;
}) => {
  const tone = SEVERITY_TONE[severity];
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {severity}
    </span>
  );
};

const ANOMALY_STATUS_TONE: Record<AnomalyStatus, { text: string; bg: string; ring: string }> = {
  Active: { text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30' },
  Acknowledged: { text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25' },
  Resolved: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/25' },
};

export const AnomalyStatusBadge = ({
  status,
  size = 'sm',
  className,
}: {
  status: AnomalyStatus;
  size?: Size;
  className?: string;
}) => {
  const tone = ANOMALY_STATUS_TONE[status];
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
};

export const PriorityBadge = ({
  priority,
  size = 'xs',
  className,
}: {
  priority: TaskPriority;
  size?: Size;
  className?: string;
}) => {
  const tone = TASK_PRIORITY_TONE[priority];
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {priority}
    </span>
  );
};

const TASK_STATUS_TONE: Record<TaskStatus, { text: string; bg: string; ring: string }> = {
  Overdue: { text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30' },
  Due: { text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25' },
  Scheduled: { text: 'text-fg-dim', bg: 'bg-overlay/[0.05]', ring: 'ring-overlay/10' },
  Completed: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/25' },
};

export const TaskStatusBadge = ({
  status,
  size = 'xs',
  className,
}: {
  status: TaskStatus;
  size?: Size;
  className?: string;
}) => {
  const tone = TASK_STATUS_TONE[status];
  const Icon = status === 'Completed' ? CheckCircle2 : status === 'Overdue' ? AlertTriangle : Clock;
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <Icon size={size === 'xs' ? 10 : 12} aria-hidden />
      {status}
    </span>
  );
};

export const UrgencyBadge = ({
  urgency,
  size = 'sm',
  className,
}: {
  urgency: ActionUrgency;
  size?: Size;
  className?: string;
}) => {
  const tone = URGENCY_TONE[urgency];
  return (
    <span className={cn(SHELL, SIZE[size], tone.bg, tone.text, tone.ring, className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {urgency === 'None' ? 'No action' : urgency}
    </span>
  );
};

export const CategoryBadge = ({ category, className }: { category: string; className?: string }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center rounded-md bg-overlay/[0.05] px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted ring-1 ring-inset ring-overlay/10',
      className,
    )}
  >
    {category}
  </span>
);
