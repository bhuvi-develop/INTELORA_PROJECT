import { useMemo } from 'react';
import { BarChart3, Gauge, Scale } from 'lucide-react';
import { SERIES } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { BarTrend, ScatterRisk, type ScatterPoint } from '@/components/charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import {
  HORIZON_DAYS,
  TONE_CLASS,
  byHighestProbability,
  formatDays,
  probabilityBandOf,
} from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Failure Probability — "What is the probability of failure?"
 *
 * Screen budget: one metric bar, two charts, one table.
 *
 *   top five        the shortlist, ranked — what to look at first
 *   risk matrix     probability against business criticality, because a 60%
 *                   chance on a high-criticality device is not the same
 *                   exposure as 60% on a low one
 *   ranking table   the full order with the evidence behind each figure
 * ─────────────────────────────────────────────────────────────────────────── */

/** Criticality is a business weighting, mapped to an axis for the matrix. */
const CRITICALITY_AXIS: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

export const FailureProbabilityWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { rows } = usePredictive();

  const ranked = useMemo(() => byHighestProbability(rows), [rows]);

  const topFive = useMemo(
    () =>
      ranked.slice(0, 5).map((row) => ({
        label: row.assetId,
        probability: Math.round(row.failureProbability * 1000) / 10,
        tone: probabilityBandOf(row.failureProbability).tone,
      })),
    [ranked],
  );

  const matrix = useMemo<ScatterPoint[]>(
    () =>
      rows.map((row) => ({
        id: row.assetId,
        label: row.assetName,
        x: CRITICALITY_AXIS[row.criticality] ?? 2,
        y: Math.round(row.failureProbability * 1000) / 10,
        // Bubble size carries how soon it lands: nearer failure reads larger.
        z: Math.max(6, 100 - Math.min(100, row.rulDays)),
        group: row.category,
        meta: `${row.component} · ${formatDays(row.rulDays)} remaining · ${row.criticality} criticality`,
      })),
    [rows],
  );

  const metrics = useMemo(() => {
    if (rows.length === 0) return [];
    const highest = ranked[0];
    const mean = rows.reduce((sum, row) => sum + row.failureProbability, 0) / rows.length;
    const high = rows.filter((row) => row.failureProbability >= 0.45).length;
    const acting = rows.filter((row) => row.failureProbability >= 0.45 && row.rulDays <= HORIZON_DAYS).length;

    return [
      {
        label: 'Highest risk asset',
        value: formatPercent(highest.failureProbability * 100, 1),
        caption: `${highest.assetId} · ${highest.component}`,
        color: TONE_CLASS[probabilityBandOf(highest.failureProbability).tone].color,
      },
      { label: 'Average fleet risk', value: formatPercent(mean * 100, 1), caption: `${rows.length} devices` },
      {
        label: 'High probability alerts',
        value: formatNumber(high),
        caption: 'at or above 45% inside the horizon',
        color: high > 0 ? TONE_CLASS.serious.color : undefined,
      },
      {
        label: 'Requires action',
        value: formatNumber(acting),
        caption: 'high risk and inside 30 days',
        color: acting > 0 ? TONE_CLASS.critical.color : undefined,
      },
      { label: 'Horizon', value: `${HORIZON_DAYS} days`, caption: 'window every figure is stated against' },
    ];
  }, [rows, ranked]);

  return (
    <WorkspaceFrame workspace={workspaceById('probability')} onBack={onBack}>
      {rows.length === 0 ? (
        <div className="panel flex min-h-[24rem] items-center justify-center">
          <EmptyState icon={Gauge} title="No predictions published yet" />
        </div>
      ) : (
        <>
          <MetricBar metrics={metrics} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <BarTrend
              title="Top 5 at-risk assets"
              subtitle="Highest probability of failure inside the 30-day horizon"
              eyebrow="Shortlist"
              icon={BarChart3}
              data={topFive}
              series={[{ key: 'probability', name: 'Failure probability', color: SERIES[0], unit: '%', decimals: 1 }]}
              layout="horizontal"
              height={288}
              categoryWidth={92}
              colorFor={(point) => TONE_CLASS[(point.tone as keyof typeof TONE_CLASS) ?? 'neutral'].color}
              footnote="Ranked on the device's weakest component — the part whose failure takes the whole device out of service."
            />

            <ScatterRisk
              title="Failure risk matrix"
              subtitle="Probability against business criticality; bubble size carries how soon the failure lands"
              eyebrow="Exposure"
              icon={Scale}
              points={matrix}
              xLabel="Criticality  (1 Low · 2 Medium · 3 High)"
              yLabel="Failure probability %"
              height={288}
              quadrant={{ x: 2.5, y: 45 }}
              quadrantLabels={[
                'Highest exposure',
                'High risk, lower criticality',
                'Critical asset, lower risk',
                'Within tolerance',
              ]}
              footnote="The upper-right quadrant is where probability and business consequence coincide. A large bubble there is the strongest case for immediate work."
            />
          </div>

          <BoundedTable
            title="Asset risk ranking"
            subtitle="Every device ordered by failure probability, with the evidence behind each figure"
            maxHeight="24rem"
          >
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-ink-900">
                <tr className="border-b border-line/60">
                  {['#', 'Device', 'Limiting component', 'Probability', 'Band', 'Criticality', 'Remaining life', 'Confidence'].map(
                    (head) => (
                      <th
                        key={head}
                        className="whitespace-nowrap px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint"
                      >
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {ranked.map((row, index) => {
                  const band = probabilityBandOf(row.failureProbability);
                  const tone = TONE_CLASS[band.tone];
                  return (
                    <tr key={row.assetId} className="transition-colors duration-150 hover:bg-overlay/[0.03]">
                      <td className="px-4 py-2.5 text-[11.5px] tabular-nums text-fg-faint">{index + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="truncate text-[12.5px] font-medium text-fg">{row.assetName}</p>
                        <p className="mt-0.5 text-[11px] text-fg-faint">
                          {row.assetId} · {row.category}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-fg-soft">{row.component}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone.color }}>
                          {formatPercent(row.failureProbability * 100, 1)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`text-[11.5px] font-medium ${tone.text}`}>{band.label}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-fg-muted">{row.criticality}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatDays(row.rulDays)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.confidence * 100, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </BoundedTable>
        </>
      )}
    </WorkspaceFrame>
  );
};
