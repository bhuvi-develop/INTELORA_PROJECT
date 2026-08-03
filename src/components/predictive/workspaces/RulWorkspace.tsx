import { useMemo } from 'react';
import { CalendarRange, TrendingDown } from 'lucide-react';
import { usePredictionRecords } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { formatDate, formatNumber, formatPercent } from '@/utils/format';
import { BarTrend, LineTrend } from '@/components/charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import {
  HORIZON_DAYS,
  TONE_CLASS,
  bandOfDays,
  bySoonestFailure,
  distributeByRul,
  formatDays,
} from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Remaining Useful Life — "When will this component fail?"
 *
 * Screen budget: one metric bar, two charts, one table.
 *
 *   decay trend        what the published figure has actually done over the
 *                      stored history — not a projection, the archive
 *   distribution       how the estate falls across procurement horizons
 *   component table    the row-level detail, scrolling inside itself
 * ─────────────────────────────────────────────────────────────────────────── */

export const RulWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { rows, components } = usePredictive();
  const archive = usePredictionRecords();

  const ranked = useMemo(() => bySoonestFailure(rows), [rows]);
  const distribution = useMemo(() => distributeByRul(rows), [rows]);

  /**
   * Mean published remaining life per stored day. Because the backend ratchets
   * the figure, this line can only fall — a rising segment would mean a defect
   * in the platform, not an estate that got younger.
   */
  const decay = useMemo(() => {
    if (archive.length === 0) return [];
    const byDay = new Map<number, { total: number; count: number }>();
    for (const record of archive) {
      const held = byDay.get(record.date);
      if (held) {
        held.total += record.rulDays;
        held.count += 1;
      } else {
        byDay.set(record.date, { total: record.rulDays, count: 1 });
      }
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([date, entry]) => ({
        label: formatDate(date),
        remainingLife: Math.round((entry.total / entry.count) * 10) / 10,
      }));
  }, [archive]);

  const distributionData = useMemo(
    () => distribution.map((slice) => ({ label: slice.label, count: slice.count, tone: slice.tone })),
    [distribution],
  );

  const metrics = useMemo(() => {
    if (rows.length === 0) return [];
    const soonest = ranked[0];
    const sorted = [...rows].sort((a, b) => a.rulDays - b.rulDays);
    const median = sorted[Math.floor(sorted.length / 2)].rulDays;
    const critical = rows.filter((row) => row.rulDays <= 7).length;
    const inHorizon = rows.filter((row) => row.rulDays <= HORIZON_DAYS).length;

    return [
      {
        label: 'Minimum RUL',
        value: formatDays(soonest.rulDays),
        caption: `${soonest.component} · ${soonest.assetId}`,
        color: TONE_CLASS[bandOfDays(soonest.rulDays).tone].color,
      },
      { label: 'Median fleet RUL', value: formatDays(median), caption: `across ${rows.length} devices` },
      {
        label: 'Critical assets',
        value: formatNumber(critical),
        caption: 'under 7 days remaining',
        color: critical > 0 ? TONE_CLASS.critical.color : undefined,
      },
      {
        label: `Inside ${HORIZON_DAYS} days`,
        value: formatNumber(inHorizon),
        caption: 'order parts now',
        color: inHorizon > 0 ? TONE_CLASS.serious.color : undefined,
      },
      {
        label: 'Predicted date',
        value: soonest.predictedFailureAt ? formatDate(soonest.predictedFailureAt) : 'Beyond range',
        caption: soonest.assetName,
      },
    ];
  }, [rows, ranked]);

  return (
    <WorkspaceFrame workspace={workspaceById('rul')} onBack={onBack}>
      {rows.length === 0 ? (
        <div className="panel flex min-h-[24rem] items-center justify-center">
          <EmptyState icon={TrendingDown} title="No predictions published yet" />
        </div>
      ) : (
        <>
          <MetricBar metrics={metrics} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {decay.length > 1 ? (
              <LineTrend
                title="RUL decay trend"
                subtitle="Mean published remaining life across every tracked component, from the stored archive"
                eyebrow="Degradation"
                icon={TrendingDown}
                data={decay}
                series={[{ key: 'remainingLife', name: 'Mean remaining life', color: SERIES[0], unit: 'd', decimals: 1 }]}
                height={272}
                domain={['auto', 'auto']}
                footnote="The published figure only ever tightens, so this curve can only fall. A rising segment would indicate a platform defect rather than an improving estate."
              />
            ) : (
              <div className="panel flex min-h-[19rem] items-center justify-center">
                <EmptyState
                  icon={TrendingDown}
                  compact
                  title="Archive still building"
                  description="The decay trend needs more than one stored day of prediction history."
                />
              </div>
            )}

            <BarTrend
              title="RUL distribution"
              subtitle="Devices by planning horizon — each edge is a procurement decision point"
              eyebrow="Distribution"
              icon={CalendarRange}
              data={distributionData}
              series={[{ key: 'count', name: 'Devices', color: SERIES[0], decimals: 0 }]}
              layout="horizontal"
              height={272}
              categoryWidth={132}
              colorFor={(point) => TONE_CLASS[(point.tone as keyof typeof TONE_CLASS) ?? 'neutral'].color}
              footnote="Banded by each device's weakest component — the part that will take it out of service first."
            />
          </div>

          <BoundedTable
            title="Component RUL breakdown"
            subtitle={`${components.length} tracked components, soonest end of life first`}
            maxHeight="24rem"
          >
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-ink-900">
                <tr className="border-b border-line/60">
                  {['Component', 'Device', 'Wear', 'Remaining life', 'Predicted date', 'Confidence', 'Priority'].map(
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
                {components.map((row) => {
                  const tone = TONE_CLASS[bandOfDays(row.rulDays).tone];
                  return (
                    <tr
                      key={`${row.assetId}-${row.component}`}
                      className="transition-colors duration-150 hover:bg-overlay/[0.03]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-5 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: tone.color }}
                            aria-hidden
                          />
                          <span className="text-[12.5px] font-medium text-fg">{row.component}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="truncate text-[12px] text-fg-soft">{row.assetName}</p>
                        <p className="mt-0.5 text-[11px] text-fg-faint">
                          {row.assetId} · {row.category}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.wear * 100, 1)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone.color }}>
                          {formatDays(row.rulDays)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {row.predictedFailureAt ? formatDate(row.predictedFailureAt) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.confidence * 100, 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-fg-muted">
                        {row.maintenancePriority}
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
