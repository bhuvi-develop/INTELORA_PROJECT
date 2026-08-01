import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Brain,
  CircleDollarSign,
  Clock3,
  Info,
  Target,
  ThumbsUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber, formatPercent } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Tooltip } from '@/components/ui/Tooltip';
import { SectionHeader } from '@/components/common';
import { BROADCAST_SLA_MS, COST_MODEL, faultClass, type CategorySelection } from './taxonomy';
import type { DetectionQuality } from './useAnomalyModule';

/* ───────────────────────────────────────────────────────────────────────────
 * Section 3 — detection quality and engineering KPI analytics.
 *
 * Seven tiles, each one a claim with its working shown. The formula line states
 * how the headline was composed, the sub-stats give the terms that went into
 * it, and the tooltip says what the metric is for and where it stops being
 * trustworthy. Every tile recomputes against the current class selection.
 * ─────────────────────────────────────────────────────────────────────────── */

interface MetricTileProps {
  accent: string;
  label: string;
  icon: LucideIcon;
  value: string;
  unit?: string;
  /** The composition, written the way an engineer would check it. */
  formula: ReactNode;
  /** What the tile is for — surfaced on hover. */
  explainer: string;
  stats: Array<{ label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }>;
  meter?: { value: number; max?: number };
  caveat?: string;
  className?: string;
}

const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-emerald-300',
  bad: 'text-rose-300',
  neutral: 'text-fg-soft',
};

const MetricTile = ({
  accent,
  label,
  icon: Icon,
  value,
  unit,
  formula,
  explainer,
  stats,
  meter,
  caveat,
  className,
}: MetricTileProps) => (
  <Card className={cn('relative flex flex-col pl-5', className)} interactive>
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
      style={{ backgroundColor: accent }}
    />

    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="eyebrow truncate">{label}</p>
        <Tooltip content={explainer} side="top">
          <span
            tabIndex={0}
            role="note"
            aria-label={`${label} — ${explainer}`}
            className="flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-fg-faint transition-colors hover:text-fg-muted focus:text-fg-muted focus:outline-none"
          >
            <Info size={11} aria-hidden />
          </span>
        </Tooltip>
      </div>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        <Icon size={14} aria-hidden />
      </span>
    </div>

    <div className="mt-2 flex items-baseline gap-1.5">
      <span className="text-[1.625rem] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</span>
      {unit ? <span className="text-[12px] font-medium text-fg-muted">{unit}</span> : null}
    </div>

    {meter ? (
      <Progress value={meter.value} max={meter.max ?? 100} color={accent} size="xs" className="mt-2.5" label={label} />
    ) : null}

    <p className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-fg-dim">{formula}</p>

    <dl className="mt-2.5 space-y-1 border-t border-overlay/[0.06] pt-2.5">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center justify-between gap-3">
          <dt className="truncate text-[11px] text-fg-muted">{stat.label}</dt>
          <dd className={cn('shrink-0 text-[11px] font-semibold tabular-nums', TONE[stat.tone ?? 'neutral'])}>
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>

    {caveat ? <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">{caveat}</p> : null}
  </Card>
);

export interface DetectionQualityGridProps {
  quality: DetectionQuality;
  selectedCategory: CategorySelection;
  scopedCount: number;
}

/**
 * A ratio with no denominator is not zero, it is unknown. Saying 0.0% precision
 * on an empty selection would be a claim the data does not support.
 */
const ratio = (value: string, denominator: number): string => (denominator > 0 ? value : '—');

export const DetectionQualityGrid = ({ quality, selectedCategory, scopedCount }: DetectionQualityGridProps) => {
  const scopeLabel =
    selectedCategory === 'ALL' ? 'the whole open journal' : faultClass(selectedCategory).label.toLowerCase();

  const { falsePositive, falseNegative, latency, horizon, adoption, impact, confidence } = quality;
  const recallBase = falseNegative.detectedAssets + falseNegative.missedAssets;
  const adoptionBase = adoption.accepted + adoption.outstanding;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Detection quality and engineering KPIs"
        subtitle={`Recomputed over ${formatNumber(scopedCount)} event${scopedCount === 1 ? '' : 's'} in scope — ${scopeLabel}. Hover any tile for what it measures.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* ── 1 · False positives ─────────────────────────────────────── */}
        <MetricTile
          accent="#F43F5E"
          label="False positive analytics"
          icon={Target}
          value={ratio(formatPercent(falsePositive.precisionPct, 1), scopedCount)}
          formula={<>Precision = TP / (TP + FP)</>}
          explainer="A rule raises the event and the isolation forest corroborates it. An event the model never backed, or one an engineer has marked as a false alarm in the detail drawer, is counted against precision. Marking one here retunes what this page reports for the session; the platform holds no feedback endpoint."
          meter={{ value: falsePositive.precisionPct }}
          stats={[
            { label: 'True positives', value: formatNumber(falsePositive.truePositives), tone: 'good' },
            { label: 'False positives', value: formatNumber(falsePositive.falsePositives), tone: 'bad' },
            { label: 'Model uncorroborated', value: formatNumber(falsePositive.uncorroborated) },
            { label: 'Envelopes to retune', value: formatNumber(falsePositive.envelopesTuned) },
          ]}
          caveat={
            falsePositive.flagged > 0
              ? `${formatNumber(falsePositive.flagged)} flagged by an engineer this session.`
              : 'Open an event and mark it a false alarm to tune the noise envelope.'
          }
        />

        {/* ── 2 · False negatives ─────────────────────────────────────── */}
        <MetricTile
          accent="#A855F7"
          label="False negative analytics"
          icon={TrendingDown}
          value={ratio(formatPercent(falseNegative.recallPct, 1), recallBase)}
          formula={<>Recall = TP / (TP + FN), at device level</>}
          explainer="A device the platform already rates critical or high-risk while nothing has been raised against it is a breakdown the detector did not see. Both terms count devices rather than events, so they are comparable. These are the units that would go into the next retraining set."
          meter={{ value: falseNegative.recallPct }}
          stats={[
            { label: 'Detected devices', value: formatNumber(falseNegative.detectedAssets), tone: 'good' },
            {
              label: 'Unflagged at risk',
              value: formatNumber(falseNegative.missedAssets),
              tone: falseNegative.missedAssets > 0 ? 'bad' : 'good',
            },
            {
              label: 'Retrain queue',
              value: falseNegative.retrainQueue.length > 0 ? falseNegative.retrainQueue.join(', ') : 'empty',
            },
          ]}
          caveat="Misses are counted estate-wide: an event that was never raised carries no class to attribute it to."
        />

        {/* ── 3 · Latency and SLA ─────────────────────────────────────── */}
        <MetricTile
          accent="#38BDF8"
          label="Detection latency & SLA"
          icon={Clock3}
          value={ratio(formatNumber(latency.broadcastMs), latency.samples)}
          unit={latency.samples > 0 ? 'ms' : undefined}
          formula={<>TTD = dwell + (t_alert − t_onset)</>}
          explainer="Two legs, measured separately. The dwell is the detector's own confirm window — deliberate, and the reason a single noisy sample never becomes an alert. The broadcast leg is the round trip this client has timed since the view mounted, and it is the leg the 200 ms target applies to."
          meter={{ value: latency.slaPct }}
          stats={[
            {
              label: `SLA < ${BROADCAST_SLA_MS} ms`,
              value: ratio(formatPercent(latency.slaPct, 1), latency.samples),
              tone: latency.samples === 0 ? 'neutral' : latency.slaPct >= 95 ? 'good' : 'bad',
            },
            { label: 'p95 round trip', value: `${formatNumber(latency.p95Ms)} ms` },
            { label: 'Mean rule dwell', value: `${formatNumber(latency.dwellSeconds, 1)} s` },
            { label: 'Observations', value: formatNumber(latency.samples) },
          ]}
          caveat="Round trips sampled once per backend tick since this view mounted."
        />

        {/* ── 4 · Prediction horizon ──────────────────────────────────── */}
        <MetricTile
          accent="#22C55E"
          label="Prediction horizon reliability"
          icon={BadgeCheck}
          value={ratio(formatNumber(horizon.leadDays, 1), horizon.assets)}
          unit={horizon.assets > 0 ? 'days' : undefined}
          formula={<>Horizon = t_breakdown − t_first_warning</>}
          explainer="For every device carrying an open event, the lead time is the remaining useful life the platform publishes for its weakest component — the window between this warning and the failure it is warning about. A short horizon on a warned device is the one to act on first."
          stats={[
            { label: 'Warned devices', value: formatNumber(horizon.assets) },
            {
              label: 'Soonest RUL',
              value: `${formatNumber(horizon.soonestDays, 1)} d`,
              tone: horizon.soonestDays > 0 && horizon.soonestDays < 7 ? 'bad' : 'neutral',
            },
            { label: 'Model confidence', value: formatPercent(horizon.confidencePct, 1) },
          ]}
          caveat="Remaining life and its confidence are the platform's published figures, passed through."
        />

        {/* ── 5 · Recommendation acceptance ───────────────────────────── */}
        <MetricTile
          accent="#14B8A6"
          label="Recommendation acceptance"
          icon={ThumbsUp}
          value={ratio(formatPercent(adoption.adoptionPct, 1), adoptionBase)}
          formula={<>Adoption = accepted / (accepted + outstanding)</>}
          explainer="Every raised event carries a prescriptive action. Claiming it is the acceptance; leaving it in the queue is not. Events that cleared before anyone claimed them are excluded from both terms — nobody accepted or rejected those, the device fixed itself."
          meter={{ value: adoption.adoptionPct }}
          stats={[
            { label: 'Accepted', value: formatNumber(adoption.accepted), tone: 'good' },
            {
              label: 'Outstanding',
              value: formatNumber(adoption.outstanding),
              tone: adoption.outstanding > 0 ? 'bad' : 'good',
            },
            { label: 'Self-cleared', value: formatNumber(adoption.selfCleared) },
          ]}
        />

        {/* ── 6 · Business impact ─────────────────────────────────────── */}
        <MetricTile
          accent="#B45309"
          label="Business impact & cost savings"
          icon={CircleDollarSign}
          value={formatCurrency(impact.costSaved)}
          formula={<>Σ(hours × rate) + hardware retained</>}
          explainer={`Avoided downtime is the count of actioned events times the platform's measured mean time to clear. The two rates the platform cannot measure are stated: ${formatCurrency(COST_MODEL.downtimeRatePerHour)} per device-hour out of service and ${formatCurrency(COST_MODEL.unitReplacementCost)} per endpoint replacement. They are the only figures on this page not derived from telemetry.`}
          stats={[
            { label: 'Events actioned', value: formatNumber(impact.actioned) },
            { label: 'Downtime avoided', value: `${formatNumber(impact.downtimeHoursAvoided, 1)} h` },
            { label: 'Hardware retained', value: formatCurrency(impact.hardwareSaved) },
          ]}
          caveat={`Rates assumed: ${formatCurrency(COST_MODEL.downtimeRatePerHour)}/h downtime, ${formatCurrency(COST_MODEL.unitReplacementCost)}/unit.`}
        />

        {/* ── 7 · Engineering confidence ──────────────────────────────── */}
        {/* Spans two columns so the second row closes flush at four across. */}
        <MetricTile
          className="xl:col-span-2"
          accent="#EC4899"
          label="Engineering confidence score"
          icon={Brain}
          value={ratio(formatPercent(confidence.scorePct, 1), scopedCount)}
          formula={<>Confidence = P(model) × SNR factor</>}
          explainer="The per-event confidence the detector publishes, derated by how much of the estate is actually reporting. A score drawn from a half-silent fleet should not read the same as one drawn from a complete one. The driver is the channel carrying the largest mean breach in scope."
          meter={{ value: confidence.scorePct }}
          stats={[
            { label: 'Model probability', value: formatPercent(confidence.modelPct, 1) },
            {
              label: 'Telemetry SNR',
              value: formatPercent(confidence.snrPct, 1),
              tone: confidence.snrPct >= 99 ? 'good' : 'bad',
            },
            { label: 'Leading driver', value: confidence.driver },
            { label: 'Mean breach', value: formatPercent(confidence.driverPct, 1) },
          ]}
          caveat="Attribution is measured from channel deviation; the scorer publishes no per-feature values."
        />
      </div>
    </section>
  );
};
