import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared chrome for the anomaly drill-downs.
 *
 * The back control navigates to the module rather than calling `navigate(-1)`.
 * History back is wrong here: these pages are reachable from a bookmark, a
 * refresh or a sibling drill-down, and in each of those cases "back" lands
 * somewhere the label did not promise. Routing to a known destination always
 * does what the label says, and going through the router keeps it a client-side
 * transition with no reload.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface DetailShellProps {
  title: string;
  subtitle: string;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export const DetailShell = ({ title, subtitle, eyebrow, meta, actions, children }: DetailShellProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          className="mb-3 -ml-1"
          onClick={() => navigate(PATHS.anomaly)}
        >
          Back to Anomaly Detection
        </Button>

        <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} meta={meta} actions={actions} />
      </div>

      {children}
    </div>
  );
};

/* ─── Stat strip ─────────────────────────────────────────────────────────── */

export interface DetailStat {
  key: string;
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  icon?: LucideIcon;
  accent?: string;
  /** Renders the value in the status tone rather than the default ink. */
  tone?: 'good' | 'bad' | 'neutral';
}

const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-emerald-300',
  bad: 'text-rose-300',
  neutral: 'text-fg',
};

/**
 * Dense figure strip under the header. Deliberately not `StatTile` — these carry
 * no sparkline and need to sit four or five across without the tile's padding.
 */
export const DetailStatStrip = ({ stats }: { stats: DetailStat[] }) => (
  <div
    className={cn(
      'grid gap-4 sm:grid-cols-2',
      stats.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
    )}
  >
    {stats.map((stat) => (
      <Card key={stat.key} className="relative flex flex-col pl-5" interactive>
        {stat.accent ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
            style={{ backgroundColor: stat.accent }}
          />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow truncate">{stat.label}</p>
          {stat.icon ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
              style={
                stat.accent
                  ? { backgroundColor: `${stat.accent}1A`, color: stat.accent }
                  : undefined
              }
            >
              <stat.icon size={14} aria-hidden />
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-[1.5rem] font-semibold leading-none tracking-[-0.02em]',
              TONE[stat.tone ?? 'neutral'],
            )}
          >
            {stat.value}
          </span>
          {stat.unit ? <span className="text-[12px] font-medium text-fg-muted">{stat.unit}</span> : null}
        </div>

        {stat.caption ? (
          <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">{stat.caption}</p>
        ) : null}
      </Card>
    ))}
  </div>
);
