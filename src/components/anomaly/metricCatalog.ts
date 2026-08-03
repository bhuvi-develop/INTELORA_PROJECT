import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Brain,
  CircleDollarSign,
  Clock3,
  Target,
  ThumbsUp,
  TrendingDown,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatCurrency, formatNumber, formatPercent } from '@/utils/format';
import { BROADCAST_SLA_MS, COST_MODEL } from './taxonomy';
import type { DetectionQuality } from './useAnomalyModule';

/* ───────────────────────────────────────────────────────────────────────────
 * Detection-quality metric catalogue.
 *
 * One definition per KPI, held in one place so the overview grid and the
 * drill-down page it opens cannot describe the same metric differently.
 *
 *   · `METRIC_CARDS`  — identity only: icon, title, accent, route. This is the
 *     whole of what the overview tile renders, which is why the overview page
 *     reads as navigation rather than as a second dashboard.
 *   · `metricDetail`  — the working: headline, formula, explainer, sub-stats,
 *     meter and caveat. Every one of these was previously inline in the tile
 *     and now renders on the metric's own page instead. Nothing was dropped in
 *     the move; the text is the tile's text.
 *
 * The composition is unchanged — these read the same `DetectionQuality` the
 * tiles read, so a headline and its drill-down still cannot disagree.
 * ─────────────────────────────────────────────────────────────────────────── */

export type MetricKey =
  | 'falsePositive'
  | 'falseNegative'
  | 'latency'
  | 'horizon'
  | 'adoption'
  | 'impact'
  | 'confidence';

export interface MetricCard {
  key: MetricKey;
  /** Card title — with the icon, the only thing the overview tile carries. */
  label: string;
  icon: LucideIcon;
  /** Tile identity colour. Carried through to the drill-down so the two match. */
  accent: string;
  /** Drill-down route. */
  to: string;
  /** Grid class, so tile position and span survive the content change. */
  className?: string;
}

/** The seven tiles, in the order and at the spans the grid has always used. */
export const METRIC_CARDS: MetricCard[] = [
  {
    key: 'falsePositive',
    label: 'False positive analytics',
    icon: Target,
    accent: '#F43F5E',
    to: PATHS.metricFalsePositives,
  },
  {
    key: 'falseNegative',
    label: 'False negative analytics',
    icon: TrendingDown,
    accent: '#A855F7',
    to: PATHS.metricFalseNegatives,
  },
  {
    key: 'latency',
    label: 'Detection latency & SLA',
    icon: Clock3,
    accent: '#38BDF8',
    to: PATHS.metricLatencySla,
  },
  {
    key: 'horizon',
    label: 'Prediction horizon reliability',
    icon: BadgeCheck,
    accent: '#22C55E',
    to: PATHS.metricPredictionHorizon,
  },
  {
    key: 'adoption',
    label: 'Recommendation acceptance',
    icon: ThumbsUp,
    accent: '#14B8A6',
    to: PATHS.metricRecommendationAcceptance,
  },
  {
    key: 'impact',
    label: 'Business impact & cost savings',
    icon: CircleDollarSign,
    accent: '#B45309',
    to: PATHS.metricBusinessImpact,
  },
  {
    /* Spans two columns so the second row closes flush at four across. */
    key: 'confidence',
    label: 'Engineering confidence score',
    icon: Brain,
    accent: '#EC4899',
    to: PATHS.metricEngineeringConfidence,
    className: 'xl:col-span-2',
  },
];

const CARD_BY_KEY = new Map(METRIC_CARDS.map((card) => [card.key, card]));

export const metricCard = (key: MetricKey): MetricCard => CARD_BY_KEY.get(key) ?? METRIC_CARDS[0];

/* ─── The working, relocated from the tile ───────────────────────────────── */

export interface MetricStat {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'neutral';
}

/* ─── Composition ────────────────────────────────────────────────────────── */

/**
 * One term of a metric, carrying the value the platform published for it.
 *
 * A term is always a measured quantity, never a label on an arrow: what the
 * composition chart draws is the same set of figures the stat list prints, so
 * the two cannot disagree.
 */
export interface MetricTerm {
  key: string;
  name: string;
  value: number;
  color: string;
}

/**
 * How a metric's terms are drawn.
 *
 * `donut` is used where the terms are parts of one whole and the headline is the
 * share one part holds — precision and recall are exactly that shape, and the
 * hole carries the ratio. `bar` is used where the terms are magnitudes on a
 * common scale that do not sum to anything meaningful: milliseconds, days,
 * per cent and currency each compare against each other rather than partition a
 * total, and a donut of those would invent a whole that does not exist.
 */
export type MetricChartForm = 'donut' | 'bar';

export interface MetricComposition {
  form: MetricChartForm;
  title: string;
  subtitle: string;
  footnote: string;
  terms: MetricTerm[];
  /** Donut only — the hero figure in the hole. */
  centerValue?: string;
  centerLabel?: string;
  /** Bar only. */
  unit?: string;
  decimals?: number;
  references?: Array<{ value: number; label: string; color?: string }>;
  /** Bar only — category axis width, tuned per metric's label lengths. */
  categoryWidth?: number;
}

export interface MetricDetail {
  card: MetricCard;
  /** Headline figure, formatted exactly as the tile formatted it. */
  value: string;
  unit?: string;
  /** The composition, written the way an engineer would check it. */
  formula: string;
  /** What the metric is for, and where it stops being trustworthy. */
  explainer: string;
  stats: MetricStat[];
  meter?: { value: number; max?: number };
  caveat?: string;
  /** The same terms as a chart — what the headline was built from. */
  composition: MetricComposition;
}

/**
 * A ratio with no denominator is not zero, it is unknown. Saying 0.0% precision
 * on an empty selection would be a claim the data does not support.
 */
const ratio = (value: string, denominator: number): string => (denominator > 0 ? value : '—');

export const metricDetail = (
  key: MetricKey,
  quality: DetectionQuality,
  scopedCount: number,
): MetricDetail => {
  const card = metricCard(key);
  const { falsePositive, falseNegative, latency, horizon, adoption, impact, confidence } = quality;

  switch (key) {
    /* ── 1 · False positives ───────────────────────────────────────────── */
    case 'falsePositive':
      return {
        card,
        value: ratio(formatPercent(falsePositive.precisionPct, 1), scopedCount),
        formula: 'Precision = TP / (TP + FP)',
        explainer:
          'A rule raises the event and the isolation forest corroborates it. An event the model never backed, or one an engineer has marked as a false alarm in the detail drawer, is counted against precision. Marking one here retunes what this page reports for the session; the platform holds no feedback endpoint.',
        meter: { value: falsePositive.precisionPct },
        stats: [
          { label: 'True positives', value: formatNumber(falsePositive.truePositives), tone: 'good' },
          { label: 'False positives', value: formatNumber(falsePositive.falsePositives), tone: 'bad' },
          { label: 'Model uncorroborated', value: formatNumber(falsePositive.uncorroborated) },
          { label: 'Envelopes to retune', value: formatNumber(falsePositive.envelopesTuned) },
        ],
        caveat:
          falsePositive.flagged > 0
            ? `${formatNumber(falsePositive.flagged)} flagged by an engineer this session.`
            : 'Open an event and mark it a false alarm to tune the noise envelope.',
        composition: {
          form: 'donut',
          title: 'Precision composition',
          subtitle: `Every one of the ${formatNumber(scopedCount)} event${scopedCount === 1 ? '' : 's'} in scope, by what it counted as`,
          footnote:
            'The three slices partition the journal exactly — the green one is the numerator, the other two are the false-positive term. Both an uncorroborated event and an engineer-flagged one land in that term, which is why a single retune moves the headline.',
          centerValue: ratio(formatPercent(falsePositive.precisionPct, 1), scopedCount),
          centerLabel: 'precision',
          terms: [
            {
              key: 'truePositives',
              name: 'True positives',
              value: falsePositive.truePositives,
              color: STATUS_COLOR.good,
            },
            {
              key: 'uncorroborated',
              name: 'Model uncorroborated',
              value: falsePositive.uncorroborated,
              color: STATUS_COLOR.critical,
            },
            {
              key: 'flagged',
              name: 'Engineer-flagged',
              value: falsePositive.flagged,
              color: STATUS_COLOR.warning,
            },
          ],
        },
      };

    /* ── 2 · False negatives ───────────────────────────────────────────── */
    case 'falseNegative': {
      const recallBase = falseNegative.detectedAssets + falseNegative.missedAssets;
      return {
        card,
        value: ratio(formatPercent(falseNegative.recallPct, 1), recallBase),
        formula: 'Recall = TP / (TP + FN), at device level',
        explainer:
          'A device the platform already rates critical or high-risk while nothing has been raised against it is a breakdown the detector did not see. Both terms count devices rather than events, so they are comparable. These are the units that would go into the next retraining set.',
        meter: { value: falseNegative.recallPct },
        stats: [
          { label: 'Detected devices', value: formatNumber(falseNegative.detectedAssets), tone: 'good' },
          {
            label: 'Unflagged at risk',
            value: formatNumber(falseNegative.missedAssets),
            tone: falseNegative.missedAssets > 0 ? 'bad' : 'good',
          },
          {
            label: 'Retrain queue',
            value:
              falseNegative.retrainQueue.length > 0 ? falseNegative.retrainQueue.join(', ') : 'empty',
          },
        ],
        caveat:
          'Misses are counted estate-wide: an event that was never raised carries no class to attribute it to.',
        composition: {
          form: 'donut',
          title: 'Recall composition',
          subtitle: `The ${formatNumber(recallBase)} device${recallBase === 1 ? '' : 's'} in the ratio, by what the detector did about each`,
          footnote:
            'Both slices count devices rather than events, so the two terms are commensurable. Ground truth here is the platform’s own risk rating, not a recorded breakdown — a detector and a risk model that share inputs can agree with each other and both be wrong.',
          centerValue: ratio(formatPercent(falseNegative.recallPct, 1), recallBase),
          centerLabel: 'recall',
          terms: [
            {
              key: 'detected',
              name: 'Detected devices',
              value: falseNegative.detectedAssets,
              color: STATUS_COLOR.good,
            },
            {
              key: 'missed',
              name: 'Unflagged at risk',
              value: falseNegative.missedAssets,
              color: STATUS_COLOR.critical,
            },
          ],
        },
      };
    }

    /* ── 3 · Latency and SLA ───────────────────────────────────────────── */
    case 'latency':
      return {
        card,
        value: ratio(formatNumber(latency.broadcastMs), latency.samples),
        unit: latency.samples > 0 ? 'ms' : undefined,
        formula: 'TTD = dwell + (t_alert − t_onset)',
        explainer:
          "Two legs, measured separately. The dwell is the detector's own confirm window — deliberate, and the reason a single noisy sample never becomes an alert. The broadcast leg is the round trip this client has timed since the view mounted, and it is the leg the 200 ms target applies to.",
        meter: { value: latency.slaPct },
        stats: [
          {
            label: `SLA < ${BROADCAST_SLA_MS} ms`,
            value: ratio(formatPercent(latency.slaPct, 1), latency.samples),
            tone: latency.samples === 0 ? 'neutral' : latency.slaPct >= 95 ? 'good' : 'bad',
          },
          { label: 'p95 round trip', value: `${formatNumber(latency.p95Ms)} ms` },
          { label: 'Mean rule dwell', value: `${formatNumber(latency.dwellSeconds, 1)} s` },
          { label: 'Observations', value: formatNumber(latency.samples) },
        ],
        caveat: 'Round trips sampled once per backend tick since this view mounted.',
        composition: {
          form: 'bar',
          title: 'Broadcast leg against the target',
          subtitle: `Round trips measured from this client, over ${formatNumber(latency.samples)} observation${latency.samples === 1 ? '' : 's'}`,
          footnote: `Only the broadcast leg is drawn, because only it is overhead and only it is what the ${BROADCAST_SLA_MS} ms target applies to. The rule dwell is three orders of magnitude larger and deliberate — the detector holding a breach until it persists — so plotting it here would flatten the two bars that can actually move.`,
          unit: 'ms',
          decimals: 0,
          categoryWidth: 128,
          references: [
            { value: BROADCAST_SLA_MS, label: `SLA ${BROADCAST_SLA_MS} ms`, color: STATUS_COLOR.warning },
          ],
          terms: [
            {
              key: 'mean',
              name: 'Mean round trip',
              value: latency.broadcastMs,
              color: latency.broadcastMs <= BROADCAST_SLA_MS ? STATUS_COLOR.good : STATUS_COLOR.critical,
            },
            {
              key: 'p95',
              name: 'p95 round trip',
              value: latency.p95Ms,
              color: latency.p95Ms <= BROADCAST_SLA_MS ? STATUS_COLOR.good : STATUS_COLOR.critical,
            },
          ],
        },
      };

    /* ── 4 · Prediction horizon ────────────────────────────────────────── */
    case 'horizon':
      return {
        card,
        value: ratio(formatNumber(horizon.leadDays, 1), horizon.assets),
        unit: horizon.assets > 0 ? 'days' : undefined,
        formula: 'Horizon = t_breakdown − t_first_warning',
        explainer:
          'For every device carrying an open event, the lead time is the remaining useful life the platform publishes for its weakest component — the window between this warning and the failure it is warning about. A short horizon on a warned device is the one to act on first.',
        stats: [
          { label: 'Warned devices', value: formatNumber(horizon.assets) },
          {
            label: 'Soonest RUL',
            value: `${formatNumber(horizon.soonestDays, 1)} d`,
            tone: horizon.soonestDays > 0 && horizon.soonestDays < 7 ? 'bad' : 'neutral',
          },
          { label: 'Model confidence', value: formatPercent(horizon.confidencePct, 1) },
        ],
        caveat: "Remaining life and its confidence are the platform's published figures, passed through.",
        composition: {
          form: 'bar',
          title: 'Runway on the warned devices',
          subtitle: `Remaining life across the ${formatNumber(horizon.assets)} device${horizon.assets === 1 ? '' : 's'} currently carrying an open event`,
          footnote:
            'The mean says whether warnings generally arrive with runway; the soonest says whether any single device has already spent its. A short bar under the seven-day mark is a warning that arrived too late to schedule around, and the mean cannot show it.',
          unit: 'd',
          decimals: 1,
          categoryWidth: 128,
          references: [
            { value: 7, label: '7 d', color: STATUS_COLOR.critical },
            { value: 30, label: '30 d', color: STATUS_COLOR.warning },
          ],
          terms: [
            {
              key: 'soonest',
              name: 'Soonest RUL',
              value: horizon.soonestDays,
              color:
                horizon.soonestDays > 0 && horizon.soonestDays < 7
                  ? STATUS_COLOR.critical
                  : STATUS_COLOR.warning,
            },
            {
              key: 'mean',
              name: 'Mean lead horizon',
              value: horizon.leadDays,
              color: card.accent,
            },
          ],
        },
      };

    /* ── 5 · Recommendation acceptance ─────────────────────────────────── */
    case 'adoption': {
      const adoptionBase = adoption.accepted + adoption.outstanding;
      return {
        card,
        value: ratio(formatPercent(adoption.adoptionPct, 1), adoptionBase),
        formula: 'Adoption = accepted / (accepted + outstanding)',
        explainer:
          'Every raised event carries a prescriptive action. Claiming it is the acceptance; leaving it in the queue is not. Events that cleared before anyone claimed them are excluded from both terms — nobody accepted or rejected those, the device fixed itself.',
        meter: { value: adoption.adoptionPct },
        stats: [
          { label: 'Accepted', value: formatNumber(adoption.accepted), tone: 'good' },
          {
            label: 'Outstanding',
            value: formatNumber(adoption.outstanding),
            tone: adoption.outstanding > 0 ? 'bad' : 'good',
          },
          { label: 'Self-cleared', value: formatNumber(adoption.selfCleared) },
        ],
        composition: {
          form: 'bar',
          title: 'Disposition of every prescribed action',
          subtitle: `The two ratio terms, and the ${formatNumber(adoption.selfCleared)} event${adoption.selfCleared === 1 ? '' : 's'} excluded from both`,
          footnote:
            'Only the first two bars are in the ratio. Self-cleared is excluded from both terms on purpose — counting a device that recovered on its own as a rejection would penalise the detector for being early — so it is drawn alongside rather than inside.',
          unit: 'events',
          decimals: 0,
          categoryWidth: 128,
          terms: [
            {
              key: 'accepted',
              name: 'Accepted',
              value: adoption.accepted,
              color: STATUS_COLOR.good,
            },
            {
              key: 'outstanding',
              name: 'Outstanding',
              value: adoption.outstanding,
              color: STATUS_COLOR.warning,
            },
            {
              key: 'selfCleared',
              name: 'Self-cleared',
              value: adoption.selfCleared,
              color: SERIES[0],
            },
          ],
        },
      };
    }

    /* ── 6 · Business impact ───────────────────────────────────────────── */
    case 'impact':
      return {
        card,
        value: formatCurrency(impact.costSaved),
        formula: 'Σ(hours × rate) + hardware retained',
        explainer: `Avoided downtime is the count of actioned events times the platform's measured mean time to clear. The two rates the platform cannot measure are stated: ${formatCurrency(COST_MODEL.downtimeRatePerHour)} per device-hour out of service and ${formatCurrency(COST_MODEL.unitReplacementCost)} per endpoint replacement. They are the only figures on this page not derived from telemetry.`,
        stats: [
          { label: 'Events actioned', value: formatNumber(impact.actioned) },
          { label: 'Downtime avoided', value: `${formatNumber(impact.downtimeHoursAvoided, 1)} h` },
          { label: 'Hardware retained', value: formatCurrency(impact.hardwareSaved) },
        ],
        caveat: `Rates assumed: ${formatCurrency(COST_MODEL.downtimeRatePerHour)}/h downtime, ${formatCurrency(COST_MODEL.unitReplacementCost)}/unit.`,
        composition: {
          form: 'bar',
          title: 'Where the retained value comes from',
          subtitle: 'The two contributions and the total they sum to, in US dollars',
          footnote: `Applied linearly on purpose. Avoided downtime is measured hours at the assumed ${formatCurrency(COST_MODEL.downtimeRatePerHour)}/h; retained hardware is closed critical events at the assumed ${formatCurrency(COST_MODEL.unitReplacementCost)}/unit. Substitute your own rates and both bars scale with them.`,
          unit: 'USD',
          decimals: 0,
          categoryWidth: 148,
          terms: [
            {
              key: 'downtime',
              name: 'Avoided downtime',
              value: impact.costSaved - impact.hardwareSaved,
              color: SERIES[0],
            },
            {
              key: 'hardware',
              name: 'Hardware retained',
              value: impact.hardwareSaved,
              color: SERIES[2],
            },
            {
              key: 'total',
              name: 'Total retained',
              value: impact.costSaved,
              color: card.accent,
            },
          ],
        },
      };

    /* ── 7 · Engineering confidence ────────────────────────────────────── */
    case 'confidence':
    default:
      return {
        card,
        value: ratio(formatPercent(confidence.scorePct, 1), scopedCount),
        formula: 'Confidence = P(model) × SNR factor',
        explainer:
          'The per-event confidence the detector publishes, derated by how much of the estate is actually reporting. A score drawn from a half-silent fleet should not read the same as one drawn from a complete one. The driver is the channel carrying the largest mean breach in scope.',
        meter: { value: confidence.scorePct },
        stats: [
          { label: 'Model probability', value: formatPercent(confidence.modelPct, 1) },
          {
            label: 'Telemetry SNR',
            value: formatPercent(confidence.snrPct, 1),
            tone: confidence.snrPct >= 99 ? 'good' : 'bad',
          },
          { label: 'Leading driver', value: confidence.driver },
          { label: 'Mean breach', value: formatPercent(confidence.driverPct, 1) },
        ],
        caveat:
          'Attribution is measured from channel deviation; the scorer publishes no per-feature values.',
        composition: {
          form: 'bar',
          title: 'The derating, term by term',
          subtitle: 'The published probability, the share of the estate it was drawn from, and their product',
          footnote:
            'The score is the product of the two terms above it, so it can never exceed either — the gap between the first bar and the third is exactly what the silent part of the estate costs. A high score drawn from a half-silent fleet is not the same claim as one drawn from a complete fleet, and a single number would hide the difference precisely when it matters.',
          unit: '%',
          decimals: 1,
          categoryWidth: 148,
          references: [{ value: 100, label: 'Ceiling', color: STATUS_COLOR.warning }],
          terms: [
            {
              key: 'model',
              name: 'Model probability',
              value: confidence.modelPct,
              color: SERIES[0],
            },
            {
              key: 'snr',
              name: 'Telemetry SNR',
              value: confidence.snrPct,
              color: confidence.snrPct >= 99 ? STATUS_COLOR.good : STATUS_COLOR.critical,
            },
            {
              key: 'score',
              name: 'Confidence score',
              value: confidence.scorePct,
              color: card.accent,
            },
          ],
        },
      };
  }
};
