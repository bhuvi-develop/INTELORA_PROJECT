import { Info, PieChart, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Progress } from '@/components/ui/Progress';
import { BarTrend, DonutSplit, type SeriesDef } from '@/components/charts';
import {
  metricDetail,
  type DetectionQuality,
  type MetricComposition,
  type MetricKey,
} from '@/components/anomaly';

/* ───────────────────────────────────────────────────────────────────────────
 * The metric's own definition, as it reads on its page.
 *
 * This is the content the overview tile used to carry — headline, meter,
 * formula, explainer, sub-stats and caveat. The overview is a navigation
 * surface now, so the working lives here, beside the charts that expand on it.
 *
 * Alongside it, the same terms as a chart. A flow diagram named the terms and
 * drew arrows between them; a chart puts them on a common scale, which is the
 * question an operator actually has — not "what feeds what", but "how big is
 * each, and which one is moving the headline". The terms are read from the same
 * catalogue entry the stat list prints, so the chart and the figures beside it
 * cannot disagree.
 *
 * One component for all seven, fed from `metricCatalog`, so the definition of a
 * metric exists exactly once in the codebase.
 * ─────────────────────────────────────────────────────────────────────────── */

const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-emerald-300',
  bad: 'text-rose-300',
  neutral: 'text-fg-soft',
};

/**
 * The metric's terms as a chart.
 *
 * A donut is only drawn when the terms genuinely partition a whole; anything
 * else is bars on a shared scale. Zero-valued slices are dropped from the donut
 * because a zero-width wedge is a legend entry pretending to be a measurement —
 * on the bar form they are kept, because a bar at zero is itself the finding.
 */
const CompositionChart = ({ composition }: { composition: MetricComposition }) => {
  if (composition.form === 'donut') {
    const slices = composition.terms.filter((term) => term.value > 0);

    if (slices.length === 0) {
      return (
        <Card className="flex flex-col">
          <EmptyState
            icon={PieChart}
            title="Nothing to compose yet"
            description="Every term of this metric is currently zero, so there is no split to draw. The figures beside this are unaffected."
          />
        </Card>
      );
    }

    return (
      <DonutSplit
        title={composition.title}
        subtitle={composition.subtitle}
        eyebrow="Composition"
        icon={PieChart}
        data={slices}
        height={216}
        centerValue={composition.centerValue}
        centerLabel={composition.centerLabel}
        footnote={composition.footnote}
      />
    );
  }

  const series: SeriesDef[] = [
    {
      key: 'value',
      name: 'Value',
      color: composition.terms[0]?.color,
      unit: composition.unit,
      decimals: composition.decimals ?? 0,
    },
  ];

  return (
    <BarTrend
      title={composition.title}
      subtitle={composition.subtitle}
      eyebrow="Composition"
      icon={SlidersHorizontal}
      data={composition.terms.map((term) => ({
        label: term.name,
        value: term.value,
        color: term.color,
      }))}
      series={series}
      layout="horizontal"
      height={Math.max(180, composition.terms.length * 56 + 60)}
      categoryWidth={composition.categoryWidth ?? 132}
      colorFor={(point) => String(point.color)}
      references={composition.references}
      footnote={composition.footnote}
    />
  );
};

export interface MetricSummaryPanelProps {
  metric: MetricKey;
  quality: DetectionQuality;
  /** Events the metric was recomputed over — the denominator behind the ratios. */
  scopedCount: number;
  className?: string;
}

export const MetricSummaryPanel = ({
  metric,
  quality,
  scopedCount,
  className,
}: MetricSummaryPanelProps) => {
  /* Deliberately not memoised: the terms are formatted strings over live
   * analytics, and the palette inside the diagram source is read at call time
   * so a theme flip has to be able to rebuild it. */
  const detail = metricDetail(metric, quality, scopedCount);
  const { card, stats, meter } = detail;
  const Icon = card.icon;

  return (
    <div className={cn('grid gap-4 xl:grid-cols-[1fr_1.15fr]', className)}>
      <Card className="relative flex flex-col pl-5">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
          style={{ backgroundColor: card.accent }}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Metric definition</p>
            <h3 className="mt-1 truncate text-[13.5px] font-semibold tracking-[-0.005em] text-fg">
              {card.label}
            </h3>
          </div>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
            style={{ backgroundColor: `${card.accent}1A`, color: card.accent }}
          >
            <Icon size={14} aria-hidden />
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-fg">
            {detail.value}
          </span>
          {detail.unit ? (
            <span className="text-[12px] font-medium text-fg-muted">{detail.unit}</span>
          ) : null}
        </div>

        {meter ? (
          <Progress
            value={meter.value}
            max={meter.max ?? 100}
            color={card.accent}
            size="xs"
            className="mt-3"
            label={card.label}
          />
        ) : null}

        <p className="mt-3.5 rounded-lg bg-overlay/[0.045] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg-soft">
          {detail.formula}
        </p>

        <p className="mt-3 text-[11.5px] leading-relaxed text-fg-dim">{detail.explainer}</p>

        <dl className="mt-3.5 space-y-1.5 border-t border-overlay/[0.06] pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between gap-3">
              <dt className="truncate text-[11.5px] text-fg-muted">{stat.label}</dt>
              <dd
                className={cn(
                  'shrink-0 text-[11.5px] font-semibold tabular-nums',
                  TONE[stat.tone ?? 'neutral'],
                )}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {detail.caveat ? (
          <p className="mt-3 flex items-start gap-1.5 border-t border-overlay/[0.06] pt-3 text-[10.5px] leading-relaxed text-fg-faint">
            <Info size={11} className="mt-[1px] shrink-0" aria-hidden />
            <span>{detail.caveat}</span>
          </p>
        ) : null}
      </Card>

      <CompositionChart composition={detail.composition} />
    </div>
  );
};
