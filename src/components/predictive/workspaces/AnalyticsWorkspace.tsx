import { useMemo } from 'react';
import { Activity, BrainCircuit, LineChart } from 'lucide-react';
import { usePredictionRecords } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { env } from '@/config/env';
import { formatDate, formatNumber, formatPercent } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarTrend, LineTrend } from '@/components/charts';
import { GrafanaPanel } from '@/components/grafana';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { TONE_CLASS } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Prediction Analytics — "How is the prediction model behaving?"
 *
 * Screen budget: one metric bar, three charts, no table.
 *
 *   confidence spread     how much evidence stands behind the published figures
 *   published trend       remaining life and probability over the stored archive
 *   Grafana history       the long-range panel served from the history store
 *
 * Deliberately not titled "accuracy". Accuracy needs outcomes — a record of
 * components that actually failed, to compare against what was predicted — and
 * the platform stores no such record. Reporting a percentage labelled accuracy
 * without ground truth would be a number with nothing behind it, so this
 * workspace reports what it can source: confidence, estimator mix and how the
 * published position has moved.
 * ─────────────────────────────────────────────────────────────────────────── */

const CONFIDENCE_BANDS = [
  { label: 'High · above 90%', from: 0.9, to: 1.01, tone: 'brand' as const },
  { label: 'Good · 80 to 90%', from: 0.8, to: 0.9, tone: 'neutral' as const },
  { label: 'Moderate · 70 to 80%', from: 0.7, to: 0.8, tone: 'warning' as const },
  { label: 'Low · below 70%', from: 0, to: 0.7, tone: 'serious' as const },
];

export const AnalyticsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { components } = usePredictive();
  const archive = usePredictionRecords();

  const confidence = useMemo(
    () =>
      CONFIDENCE_BANDS.map((band) => ({
        label: band.label,
        count: components.filter((row) => row.confidence >= band.from && row.confidence < band.to).length,
        tone: band.tone,
      })),
    [components],
  );

  const estimators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of components) counts.set(row.modelVersion || 'unpublished', (counts.get(row.modelVersion || 'unpublished') ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [components]);

  const trend = useMemo(() => {
    if (archive.length === 0) return [];
    const byDay = new Map<number, { rul: number; probability: number; count: number }>();
    for (const record of archive) {
      const held = byDay.get(record.date);
      if (held) {
        held.rul += record.rulDays;
        held.probability += record.failureProbability;
        held.count += 1;
      } else {
        byDay.set(record.date, { rul: record.rulDays, probability: record.failureProbability, count: 1 });
      }
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([date, entry]) => ({
        label: formatDate(date),
        remainingLife: Math.round((entry.rul / entry.count) * 10) / 10,
        probability: Math.round((entry.probability / entry.count) * 1000) / 10,
      }));
  }, [archive]);

  const metrics = useMemo(() => {
    if (components.length === 0) return [];
    const mean = components.reduce((sum, row) => sum + row.confidence, 0) / components.length;
    const lowest = components.reduce((min, row) => (row.confidence < min.confidence ? row : min), components[0]);
    const hybrid = components.filter((row) => row.modelVersion.startsWith('hybrid')).length;

    return [
      { label: 'Mean confidence', value: formatPercent(mean * 100, 1), caption: `${components.length} components` },
      {
        label: 'Lowest confidence',
        value: formatPercent(lowest.confidence * 100, 0),
        caption: `${lowest.component} · ${lowest.assetId}`,
        color: lowest.confidence < 0.7 ? TONE_CLASS.serious.color : undefined,
      },
      { label: 'Regression-blended', value: formatNumber(hybrid), caption: 'informed by observed condition' },
      {
        label: 'Analytical only',
        value: formatNumber(components.length - hybrid),
        caption: 'projected from wear rate',
      },
      {
        label: 'Archive depth',
        value: formatNumber(trend.length),
        caption: trend.length > 0 ? 'days of published history' : 'archive loading',
      },
    ];
  }, [components, trend.length]);

  return (
    <WorkspaceFrame workspace={workspaceById('analytics')} onBack={onBack}>
      {components.length === 0 ? (
        <div className="panel flex min-h-[24rem] items-center justify-center">
          <EmptyState icon={Activity} title="No predictions to analyse yet" />
        </div>
      ) : (
        <>
          <MetricBar metrics={metrics} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <BarTrend
              title="Confidence distribution"
              subtitle="Confidence rises when a prediction sits far from the decision boundary and when more history stands behind it"
              eyebrow="Evidence"
              icon={BrainCircuit}
              data={confidence}
              series={[{ key: 'count', name: 'Components', color: SERIES[0], decimals: 0 }]}
              layout="horizontal"
              height={268}
              categoryWidth={148}
              colorFor={(point) => TONE_CLASS[(point.tone as keyof typeof TONE_CLASS) ?? 'neutral'].color}
              footnote="A low-confidence figure is not a wrong figure — it is one the platform is hedging on, and its projection band widens to say so."
            />

            {trend.length > 1 ? (
              <LineTrend
                title="Published position over the archive"
                subtitle="Mean remaining life and mean failure probability across every tracked component"
                eyebrow="Trend"
                icon={LineChart}
                data={trend}
                series={[
                  { key: 'remainingLife', name: 'Mean remaining life', color: SERIES[0], unit: 'd', decimals: 1 },
                  { key: 'probability', name: 'Mean failure probability', color: SERIES[1], unit: '%', decimals: 1 },
                ]}
                height={268}
                domain={['auto', 'auto']}
                footnote="Both figures are ratcheted by the backend: remaining life can only fall and probability can only rise. Movement against those directions would indicate a platform defect."
              />
            ) : (
              <Card className="flex min-h-[19rem] items-center justify-center">
                <EmptyState
                  icon={LineChart}
                  compact
                  title="Archive still building"
                  description="A trend needs more than one stored day of prediction history."
                />
              </Card>
            )}
          </div>

          <Card>
            <CardHeader
              title="Estimator mix"
              subtitle="Published per component, so any figure can be traced to the model that produced it"
              eyebrow="Provenance"
              icon={BrainCircuit}
            />
            <ul className="mt-4 space-y-3">
              {estimators.map((entry) => {
                const share = entry.count / components.length;
                return (
                  <li key={entry.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[11.5px] text-fg-soft">{entry.label}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-fg">
                        {formatNumber(entry.count)}
                        <span className="ml-1.5 font-normal text-fg-dim">{formatPercent(share * 100, 0)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-overlay/[0.07]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${share * 100}%`,
                          backgroundColor: entry.label.startsWith('hybrid') ? SERIES[2] : SERIES[0],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-line/70 pt-3 text-[11.5px] leading-relaxed text-fg-dim">
              <span className="font-medium text-fg-muted">wear-rate</span> is the analytical projection — available
              immediately and exact about the model that produced the wear.{' '}
              <span className="font-medium text-fg-muted">hybrid-regression</span> blends a fit against observed
              condition, weighted by how well that fit explains its own history and capped so it never fully displaces
              the physical model.
            </p>
          </Card>

          <GrafanaPanel
            dashboard={env.grafana.dashboards.predictive}
            panelId={2}
            title="Historical prediction panel"
            subtitle="Long-range degradation and model behaviour served from the Grafana history store"
            height={300}
            refresh="1m"
          />

          <p className="text-[11.5px] leading-relaxed text-fg-dim">
            This workspace does not report prediction accuracy. Accuracy needs outcomes — a record of which components
            actually failed, compared against what was predicted — and the platform stores no such record. What is shown
            instead is what can be sourced: confidence, estimator provenance and how the published position has moved.
          </p>
        </>
      )}
    </WorkspaceFrame>
  );
};
