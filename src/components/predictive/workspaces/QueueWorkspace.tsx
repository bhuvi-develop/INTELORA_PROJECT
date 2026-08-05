import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import type { TaskPriority } from '@/engine/types';
import { TASK_PRIORITY_RANK, TASK_PRIORITY_TONE } from '@/engine/derive';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatPercent } from '@/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { IconButton } from '@/components/ui/Button';
import { usePredictive } from '../context';
import { workspaceById, type WorkspaceId } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { HORIZON_DAYS, TONE_CLASS, bandOfDays, formatDays } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Maintenance Queue — "What is the prioritised work order queue?"
 *
 * One table and nothing else. The preceding workspaces establish when, how
 * likely and which part; this is the list an engineer works down and a buyer
 * orders from, so anything beside it would be a distraction from the only job
 * this screen has.
 *
 * Ordered by time remaining rather than by priority: priority says how hard to
 * push, time decides what comes first. Ten rows a page, because a work list
 * longer than a screen stops being a work list.
 * ─────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 10;

type HorizonFilter = 'horizon' | 'quarter' | 'all';

const HORIZONS: Array<{ value: HorizonFilter; label: string; days: number }> = [
  { value: 'horizon', label: `Within ${HORIZON_DAYS} days`, days: HORIZON_DAYS },
  { value: 'quarter', label: 'Within 90 days', days: 90 },
  { value: 'all', label: 'Entire backlog', days: Number.POSITIVE_INFINITY },
];

export const QueueWorkspace = ({ onBack, onOpen }: { onBack: () => void; onOpen: (id: WorkspaceId) => void }) => {
  const { components, assets } = usePredictive();

  const [horizon, setHorizon] = useState<HorizonFilter>('quarter');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const window = HORIZONS.find((entry) => entry.value === horizon) ?? HORIZONS[1];
  const categories = useMemo(() => Array.from(new Set(components.map((row) => row.category))).sort(), [components]);

  const queue = useMemo(
    () =>
      components.filter(
        (row) =>
          row.rulDays <= window.days &&
          (priority === 'all' || row.maintenancePriority === priority) &&
          (category === 'all' || row.category === category),
      ),
    [components, window.days, priority, category],
  );

  const pageCount = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = queue.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const metrics = useMemo(() => {
    const critical = queue.filter((row) => row.maintenancePriority === 'Critical').length;
    const devices = new Set(queue.map((row) => row.assetId)).size;
    const parts = new Set(queue.map((row) => row.component)).size;
    const next = queue[0];

    return [
      { label: 'Items in queue', value: formatNumber(queue.length), caption: window.label.toLowerCase() },
      {
        label: 'Critical priority',
        value: formatNumber(critical),
        caption: 'push to the front',
        color: critical > 0 ? TONE_CLASS.critical.color : undefined,
      },
      { label: 'Devices affected', value: formatNumber(devices), caption: `of ${assets.length} commissioned` },
      { label: 'Distinct parts', value: formatNumber(parts), caption: 'procurement lines' },
      {
        label: 'Next due',
        value: next ? formatDays(next.rulDays) : '—',
        caption: next ? `${next.component} · ${next.assetId}` : 'queue clear',
        color: next ? TONE_CLASS[bandOfDays(next.rulDays).tone].color : undefined,
      },
    ];
  }, [queue, window.label, assets.length]);

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <WorkspaceFrame
      workspace={workspaceById('queue')}
      onBack={onBack}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            aria-label="Horizon"
            value={horizon}
            onChange={(event) => reset(() => setHorizon(event.target.value as HorizonFilter))}
            options={HORIZONS.map((entry) => ({ value: entry.value, label: entry.label }))}
            containerClassName="w-[10.5rem]"
          />
          <Select
            size="sm"
            aria-label="Priority"
            value={priority}
            onChange={(event) => reset(() => setPriority(event.target.value as TaskPriority | 'all'))}
            options={[
              { value: 'all', label: 'All priorities' },
              ...(Object.keys(TASK_PRIORITY_RANK) as TaskPriority[]).map((level) => ({
                value: level,
                label: level,
              })),
            ]}
            containerClassName="w-[9rem]"
          />
          <Select
            size="sm"
            aria-label="Device class"
            value={category}
            onChange={(event) => reset(() => setCategory(event.target.value))}
            options={[
              { value: 'all', label: 'All classes' },
              ...categories.map((entry) => ({ value: entry, label: entry })),
            ]}
            containerClassName="w-[9.5rem]"
          />
        </div>
      }
    >
      <MetricBar metrics={metrics} />

      <BoundedTable
        title="Prioritised work backlog"
        subtitle={`${formatNumber(queue.length)} of ${formatNumber(components.length)} tracked components`}
        maxHeight="none"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] tabular-nums text-fg-dim">
              {queue.length === 0 ? '0' : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, queue.length)}`}{' '}
              of {formatNumber(queue.length)}
            </span>
            <IconButton
              icon={ChevronLeft}
              label="Previous page"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            />
            <IconButton
              icon={ChevronRight}
              label="Next page"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            />
          </div>
        }
      >
        {queue.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nothing in this window"
            description="No component reaches end of life inside the selected horizon. Widen the window to see the longer-range backlog."
          />
        ) : (
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <thead className="bg-ink-900">
              <tr className="border-b border-line/60">
                {['#', 'Part to order', 'Device', 'Wear', 'Remaining life', 'Book by', 'Risk', 'Priority', ''].map(
                  (head, index) => (
                    <th
                      key={`${head}-${index}`}
                      className="whitespace-nowrap px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint"
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {visible.map((row, index) => {
                const tone = TONE_CLASS[bandOfDays(row.rulDays).tone];
                const priorityTone = TASK_PRIORITY_TONE[row.maintenancePriority];
                const rank = (safePage - 1) * PAGE_SIZE + index + 1;

                return (
                  <tr
                    key={`${row.assetId}-${row.component}`}
                    className="transition-colors duration-150 hover:bg-overlay/[0.03]"
                  >
                    <td className="px-3 py-3 text-[11.5px] tabular-nums text-fg-faint">{rank}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-5 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: tone.color }}
                          aria-hidden
                        />
                        <span className="text-[12.5px] font-medium text-fg">{row.component}</span>
                        {row.isPrimary ? (
                          <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                            Constraint
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate text-[12px] text-fg-soft">{row.assetName}</p>
                      <p className="mt-0.5 text-[11px] text-fg-faint">
                        {row.assetId} · {row.category}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[12px] tabular-nums text-fg-muted">
                      {formatPercent(row.wear * 100, 1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone.color }}>
                        {formatDays(row.rulDays)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] tabular-nums text-fg-muted">
                      {row.predictedFailureAt ? formatDate(row.predictedFailureAt) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] tabular-nums text-fg-muted">
                      {formatPercent(row.failureProbability * 100, 1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
                          priorityTone.bg,
                          priorityTone.text,
                          priorityTone.ring,
                        )}
                      >
                        {row.maintenancePriority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpen('preventive')}
                        title={`Find a scheduled visit for ${row.assetId} that can absorb this work`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-overlay/[0.05] px-2.5 py-1.5 text-[11px] font-medium text-fg-muted ring-1 ring-inset ring-line/70 transition-colors duration-150 hover:bg-brand-500/12 hover:text-brand-200 hover:ring-brand-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
                      >
                        <CalendarPlus size={12} aria-hidden />
                        Schedule
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </BoundedTable>

      <p className="text-[11.5px] leading-relaxed text-fg-dim">
        &ldquo;Book by&rdquo; is the date the prediction implies; because a published remaining-life figure only ever
        tightens, that date moves nearer on a later pass but never further away. <span className="text-fg-muted">Schedule</span>{' '}
        opens the maintenance calendar to find a visit that can absorb the work — the platform has no work-order or
        dispatch endpoint, so nothing here assigns an engineer.
      </p>
    </WorkspaceFrame>
  );
};
