import { Link } from 'react-router-dom';
import { Clock, Inbox, type LucideIcon } from 'lucide-react';
import type { Severity } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeverityBadge } from './StatusBadge';

export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  severity: Severity;
  at: number;
  /** Monospaced chip — typically the error code or asset id. */
  tag?: string;
  meta?: string;
  href?: string;
}

export interface EventTimelineProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  events: TimelineEvent[];
  className?: string;
  /** Cap the rendered rows. Whatever is dropped is reported below the list. */
  limit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const EventTimeline = ({
  title,
  subtitle,
  eyebrow,
  icon = Clock,
  events,
  className,
  limit,
  emptyTitle = 'No events in this window',
  emptyDescription,
}: EventTimelineProps) => {
  const shown = limit === undefined ? events : events.slice(0, limit);
  const dropped = events.length - shown.length;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} subtitle={subtitle} eyebrow={eyebrow} icon={icon} />

      <div className="mt-4 flex-1">
        {shown.length === 0 ? (
          <EmptyState icon={Inbox} compact title={emptyTitle} description={emptyDescription} />
        ) : (
          <ol className="relative space-y-0">
            <span className="absolute bottom-3 left-[3.5px] top-3 w-px bg-overlay/[0.08]" aria-hidden />
            {shown.map((event) => {
              const tone = SEVERITY_TONE[event.severity];
              const body = (
                <div className="flex min-w-0 flex-1 flex-col gap-1 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-[12.5px] font-semibold leading-snug text-fg">{event.title}</p>
                    <SeverityBadge severity={event.severity} size="xs" />
                  </div>
                  {event.description ? (
                    <p className="text-[11.5px] leading-relaxed text-fg-muted">{event.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-fg-faint">
                    {event.tag ? (
                      <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-muted">
                        {event.tag}
                      </span>
                    ) : null}
                    {event.meta ? <span>{event.meta}</span> : null}
                    <time dateTime={new Date(event.at).toISOString()} title={formatDateTime(event.at)}>
                      {formatRelative(event.at)}
                    </time>
                  </div>
                </div>
              );

              return (
                <li key={event.id} className="relative flex gap-3">
                  <span
                    className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-ink-800"
                    style={{ backgroundColor: tone.color }}
                    aria-hidden
                  />
                  {event.href ? (
                    <Link to={event.href} className="min-w-0 flex-1 transition-opacity hover:opacity-85">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {dropped > 0 ? (
          <p className="border-t border-overlay/[0.06] pt-3 text-[11px] text-fg-dim">
            {dropped} earlier event{dropped === 1 ? '' : 's'} not shown.
          </p>
        ) : null}
      </div>
    </Card>
  );
};
