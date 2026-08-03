import { useMemo } from 'react';
import { CalendarClock, CheckCircle2, Eye, Lightbulb, Siren } from 'lucide-react';
import type { ActionUrgency } from '@/engine/types';
import { URGENCY_TONE } from '@/engine/derive';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { TONE_CLASS, bandOfDays, formatDays } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Prescriptive Maintenance — "What action should be taken?"
 *
 * A board rather than a list, because urgency is the only ordering that matters
 * and a board makes the size of each column readable at a glance.
 *
 * Three columns, and only three: the platform publishes four urgency levels but
 * "None" is the absence of a recommendation and does not belong on a board of
 * work.
 *
 * A note on what is missing. A commercial dashboard would put downtime avoided
 * and cost saved at the top of this screen. Those figures need an hourly cost
 * of outage and a repair cost per component, and the platform records neither —
 * so this workspace reports decision confidence and exposure instead. Inventing
 * a currency figure in the browser would be a number with no source.
 * ─────────────────────────────────────────────────────────────────────────── */

const COLUMNS: ActionUrgency[] = ['Immediate', 'Scheduled', 'Monitor'];

const COLUMN_ICON: Record<ActionUrgency, typeof Siren> = {
  Immediate: Siren,
  Scheduled: CalendarClock,
  Monitor: Eye,
  None: CheckCircle2,
};

const COLUMN_MEANING: Record<ActionUrgency, string> = {
  Immediate: 'Do not leave in service unattended',
  Scheduled: 'Book into the next service window',
  Monitor: 'Observe before committing work',
  None: 'No intervention justified',
};

export const PrescriptiveWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { assets, rows } = usePredictive();

  const actions = useMemo(() => {
    const predictions = new Map(rows.map((row) => [row.assetId, row]));
    return assets
      .map((asset) => ({
        assetId: asset.device.assetId,
        assetName: asset.device.assetName,
        category: asset.category,
        criticality: asset.criticality,
        urgency: asset.prescriptive.urgency,
        action: asset.prescriptive.action,
        rationale: asset.prescriptive.rationale,
        prediction: predictions.get(asset.device.assetId),
      }))
      .filter((entry) => entry.action.length > 0);
  }, [assets, rows]);

  const board = useMemo(
    () =>
      COLUMNS.map((urgency) => ({
        urgency,
        items: actions
          .filter((entry) => entry.urgency === urgency)
          .sort((a, b) => (a.prediction?.rulDays ?? Infinity) - (b.prediction?.rulDays ?? Infinity)),
      })),
    [actions],
  );

  const metrics = useMemo(() => {
    const count = (urgency: ActionUrgency) => actions.filter((entry) => entry.urgency === urgency).length;
    const withPrediction = actions.filter((entry) => entry.prediction);
    const meanConfidence =
      withPrediction.length === 0
        ? 0
        : withPrediction.reduce((sum, entry) => sum + (entry.prediction?.confidence ?? 0), 0) / withPrediction.length;
    const exposedDays = withPrediction
      .filter((entry) => entry.urgency === 'Immediate')
      .reduce((min, entry) => Math.min(min, entry.prediction?.rulDays ?? Infinity), Infinity);

    return [
      {
        label: 'Immediate',
        value: formatNumber(count('Immediate')),
        caption: 'act without delay',
        color: count('Immediate') > 0 ? URGENCY_TONE.Immediate.color : undefined,
      },
      {
        label: 'Scheduled',
        value: formatNumber(count('Scheduled')),
        caption: 'next service window',
        color: URGENCY_TONE.Scheduled.color,
      },
      { label: 'Monitor', value: formatNumber(count('Monitor')), caption: 'observe first' },
      {
        label: 'Decision confidence',
        value: formatPercent(meanConfidence * 100, 1),
        caption: 'mean across recommended devices',
      },
      {
        label: 'Nearest exposure',
        value: Number.isFinite(exposedDays) ? formatDays(exposedDays) : '—',
        caption: 'soonest failure among immediate actions',
        color: Number.isFinite(exposedDays) ? TONE_CLASS.critical.color : undefined,
      },
    ];
  }, [actions]);

  return (
    <WorkspaceFrame workspace={workspaceById('prescriptive')} onBack={onBack}>
      {actions.length === 0 ? (
        <div className="panel flex min-h-[24rem] items-center justify-center">
          <EmptyState icon={Lightbulb} title="No recommendations published yet" />
        </div>
      ) : (
        <>
          <MetricBar metrics={metrics} />

          {/* ── Decision board ───────────────────────────────────────── */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            {board.map((column) => {
              const tone = URGENCY_TONE[column.urgency];
              const Icon = COLUMN_ICON[column.urgency];

              return (
                <section
                  key={column.urgency}
                  className="flex min-w-0 flex-col rounded-xl bg-overlay/[0.02] ring-1 ring-inset ring-line/60"
                >
                  <header className="flex items-center gap-2.5 border-b border-line/60 px-3.5 py-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ color: tone.color, backgroundColor: `${tone.color}1F` }}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-fg">
                        {column.urgency}
                      </p>
                      <p className="mt-0.5 truncate text-[10.5px] text-fg-faint">
                        {COLUMN_MEANING[column.urgency]}
                      </p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-fg">
                      {column.items.length}
                    </span>
                  </header>

                  <div className="scroll-thin flex flex-col gap-2.5 overflow-y-auto p-3" style={{ maxHeight: '30rem' }}>
                    {column.items.length === 0 ? (
                      <p className="px-1 py-6 text-center text-[11.5px] text-fg-faint">Nothing in this column</p>
                    ) : (
                      column.items.map((entry) => {
                        const prediction = entry.prediction;
                        const band = prediction ? TONE_CLASS[bandOfDays(prediction.rulDays).tone] : TONE_CLASS.neutral;

                        return (
                          <article
                            key={entry.assetId}
                            className="rounded-lg bg-ink-900/70 p-3 ring-1 ring-inset ring-line/60 transition-colors duration-150 hover:ring-brand-400/25"
                          >
                            <p className="text-[12.5px] font-semibold leading-snug text-fg">{entry.action}</p>
                            <p className="mt-1 truncate text-[11px] text-fg-dim">
                              {entry.assetName} · {entry.assetId}
                            </p>

                            {prediction ? (
                              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/50 pt-2 text-[10.5px]">
                                <span className="text-fg-faint">{prediction.component}</span>
                                <span className="font-semibold tabular-nums" style={{ color: band.color }}>
                                  {formatDays(prediction.rulDays)}
                                </span>
                                <span className="tabular-nums text-fg-dim">
                                  {formatPercent(prediction.failureProbability * 100, 0)} risk
                                </span>
                                <span className="ml-auto rounded bg-overlay/[0.06] px-1.5 py-0.5 text-fg-faint">
                                  {entry.criticality}
                                </span>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <BoundedTable
            title="Detailed action log"
            subtitle="Every recommendation with the reasoning the platform published for it"
            maxHeight="22rem"
          >
            <table className="w-full min-w-[58rem] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-ink-900">
                <tr className="border-b border-line/60">
                  {['Urgency', 'Device', 'Action', 'Limiting part', 'Remaining life', 'Rationale'].map((head) => (
                    <th
                      key={head}
                      className="whitespace-nowrap px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {actions
                  .slice()
                  .sort(
                    (a, b) =>
                      COLUMNS.indexOf(a.urgency as ActionUrgency) - COLUMNS.indexOf(b.urgency as ActionUrgency) ||
                      (a.prediction?.rulDays ?? Infinity) - (b.prediction?.rulDays ?? Infinity),
                  )
                  .map((entry) => {
                    const tone = URGENCY_TONE[entry.urgency as ActionUrgency];
                    const prediction = entry.prediction;
                    return (
                      <tr key={entry.assetId} className="transition-colors duration-150 hover:bg-overlay/[0.03]">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
                              tone.bg,
                              tone.text,
                              tone.ring,
                            )}
                          >
                            {entry.urgency}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate text-[12px] text-fg-soft">{entry.assetName}</p>
                          <p className="mt-0.5 text-[11px] text-fg-faint">{entry.assetId}</p>
                        </td>
                        <td className="px-4 py-2.5 text-[12.5px] font-medium text-fg">{entry.action}</td>
                        <td className="px-4 py-2.5 text-[12px] text-fg-muted">{prediction?.component ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                          {prediction ? formatDays(prediction.rulDays) : '—'}
                        </td>
                        <td className="max-w-[24rem] px-4 py-2.5 text-[11.5px] leading-relaxed text-fg-muted">
                          {entry.rationale}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </BoundedTable>

          <p className="text-[11.5px] leading-relaxed text-fg-dim">
            Downtime avoided and cost saved are not shown. Both need an hourly cost of outage and a repair cost per
            component, and the platform records neither — so this workspace reports decision confidence and exposure,
            which it can actually source.
          </p>
        </>
      )}
    </WorkspaceFrame>
  );
};
