import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export interface RankListItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Monospaced identifier chip. */
  tag?: string;
  value: ReactNode;
  /** Rendered under the value — a meter, badge or delta. */
  trailing?: ReactNode;
  href?: string;
}

export interface RankListProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  items: RankListItem[];
  loading?: boolean;
  ordinals?: boolean;
  actions?: ReactNode;
  emptyTitle?: string;
  className?: string;
}

export const RankList = ({
  title,
  subtitle,
  eyebrow,
  icon,
  items,
  loading = false,
  ordinals = true,
  actions,
  emptyTitle = 'Nothing to rank yet',
  className,
}: RankListProps) => (
  <Card className={cn('flex flex-col', className)}>
    <CardHeader title={title} subtitle={subtitle} eyebrow={eyebrow} icon={icon} actions={actions} />

    <div className="mt-3.5 flex-1">
      {loading ? (
        <ul className="space-y-1">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <Skeleton className="h-3 w-12" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} compact title={emptyTitle} />
      ) : (
        <ul className="divide-y divide-overlay/[0.045]">
          {items.map((item, index) => {
            const row = (
              <div className="flex items-center gap-3 py-2.5">
                {ordinals ? (
                  <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-fg-faint">
                    {index + 1}
                  </span>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-fg">{item.title}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {item.tag ? (
                      <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-muted">
                        {item.tag}
                      </span>
                    ) : null}
                    {item.subtitle ? <span className="truncate text-[10.5px] text-fg-dim">{item.subtitle}</span> : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[12.5px] font-semibold tabular-nums text-fg">{item.value}</span>
                  {item.trailing}
                </div>
              </div>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    to={item.href}
                    className="block rounded-lg px-1 transition-colors hover:bg-overlay/[0.03] focus-visible:bg-overlay/[0.04]"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="px-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </Card>
);
