import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, Waves } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/* ───────────────────────────────────────────────────────────────────────────
 * Stream entry points.
 *
 * These two cards replace the two charts this slot used to hold. Both charts
 * were compromises forced by the space: the timeline stacked four severities
 * into one plot, where a two-pixel Critical band sat underneath a forty-pixel
 * Info band, and the signal trace normalised every channel into per cent of its
 * own baseline so that volts and degrees could share a y-axis.
 *
 * Neither compromise is necessary on a page of its own, so each opens one:
 * severity by severity on the timeline, channel by channel on the stream. The
 * card carries the name and the way in, and nothing else — the figures belong
 * on the page that has room to qualify them.
 * ─────────────────────────────────────────────────────────────────────────── */

interface StreamEntry {
  key: string;
  title: string;
  /** Label on the control, and what the destination is called. */
  action: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  to: string;
}

const ENTRIES: StreamEntry[] = [
  {
    key: 'timeline',
    title: 'Detection Timeline',
    action: 'Analytics',
    description:
      'Critical, Major, Warning and Info each on their own charts, then the same journal counted hourly, daily, weekly and monthly.',
    icon: Activity,
    accent: '#38BDF8',
    to: PATHS.anomalyDetectionTimeline,
  },
  {
    key: 'stream',
    title: 'Live Stream',
    action: 'Live Stream',
    description:
      'Voltage, current, power, temperature, frequency and power factor, each on its own axis in its own units with its own gauge.',
    icon: Waves,
    accent: '#14B8A6',
    to: PATHS.anomalyLiveStream,
  },
];

export const StreamNavGrid = () => {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {ENTRIES.map(({ key, title, action, description, icon: Icon, accent, to }) => (
        <Card
          key={key}
          role="link"
          tabIndex={0}
          aria-label={`${title} — open ${action}`}
          className={cn(
            'group relative flex cursor-pointer flex-col justify-between gap-4 pl-5',
            'hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60',
          )}
          interactive
          onClick={() => navigate(to)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            navigate(to);
          }}
          // Glow drawn in the card's own accent, so the affordance carries the
          // identity of the page it opens.
          onMouseEnter={(event) => {
            event.currentTarget.style.boxShadow = `inset 0 0 0 1px ${accent}59, 0 8px 26px -12px ${accent}4D`;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.boxShadow = '';
          }}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
            style={{ backgroundColor: accent }}
          />

          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
              style={{ backgroundColor: `${accent}1A`, color: accent }}
            >
              <Icon size={18} aria-hidden />
            </span>

            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold leading-snug tracking-[-0.005em] text-fg">
                {title}
              </h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">{description}</p>
            </div>
          </div>

          {/* Sits above the card's own hit target so the control reads as the
              primary affordance without becoming a second, competing one. */}
          <span className="relative z-10 self-start">
            <Button
              variant="subtle"
              size="sm"
              iconRight={ArrowRight}
              onClick={(event) => {
                event.stopPropagation();
                navigate(to);
              }}
            >
              {action}
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
};
