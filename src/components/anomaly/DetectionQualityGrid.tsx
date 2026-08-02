import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/common';
import { faultClass, type CategorySelection } from './taxonomy';
import { METRIC_CARDS } from './metricCatalog';
import type { DetectionQuality } from './useAnomalyModule';

/* ───────────────────────────────────────────────────────────────────────────
 * Section 3 — detection quality and engineering KPIs, as navigation.
 *
 * Seven tiles, each one an icon and a name. Nothing else: the headline, the
 * formula that composed it, the terms that went into it and its caveat all live
 * on the metric's own page now, where there is room to show them beside the
 * charts that expand on them. A tile that reported four sub-stats and a meter
 * was a second dashboard competing with the first, and the drill-down it opened
 * said everything the tile did and more.
 *
 * The grid, the spans, the accents and the routes are unchanged — only what is
 * rendered inside each card. Definitions come from `metricCatalog`, which is
 * also what the drill-downs read, so the tile and the page it opens cannot
 * drift apart.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface DetectionQualityGridProps {
  /**
   * Live analytics for the seven KPIs.
   *
   * Not read here any more — the tiles carry no figures. Kept on the props so
   * the call site in `AnomalyDetectionPage` is unchanged and the section still
   * declares what it is a view onto.
   */
  quality: DetectionQuality;
  selectedCategory: CategorySelection;
  scopedCount: number;
}

export const DetectionQualityGrid = ({ selectedCategory, scopedCount }: DetectionQualityGridProps) => {
  const navigate = useNavigate();

  const scopeLabel =
    selectedCategory === 'ALL' ? 'the whole open journal' : faultClass(selectedCategory).label.toLowerCase();

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Detection quality and engineering KPIs"
        subtitle={`Seven analyses over ${formatNumber(scopedCount)} event${scopedCount === 1 ? '' : 's'} in scope — ${scopeLabel}. Open one for its figures, formula and charts.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRIC_CARDS.map(({ key, label, icon: Icon, accent, to, className }) => (
          <Card
            key={key}
            role="link"
            tabIndex={0}
            aria-label={`${label} — open analysis`}
            className={cn(
              'group relative flex min-h-[7.25rem] cursor-pointer flex-col justify-center pl-5',
              'hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60',
              className,
            )}
            interactive
            onClick={() => navigate(to)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              navigate(to);
            }}
            // The hover glow is drawn in the tile's own accent rather than a
            // fixed colour, so the affordance carries the identity of the metric
            // it opens.
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

            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
                style={{ backgroundColor: `${accent}1A`, color: accent }}
              >
                <Icon size={18} aria-hidden />
              </span>

              <p className="min-w-0 text-[13.5px] font-semibold leading-snug tracking-[-0.005em] text-fg">
                {label}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
};
