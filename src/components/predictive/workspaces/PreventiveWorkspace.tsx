import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PreventiveTask } from '@/engine/types';
import { TASK_PRIORITY_RANK, TASK_PRIORITY_TONE } from '@/engine/derive';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatRelative } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { IconButton } from '@/components/ui/Button';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { TONE_CLASS } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Preventive Maintenance — "What maintenance should be scheduled?"
 *
 * A calendar, because scheduled work is a question about dates and every other
 * presentation of it makes an engineer do the date arithmetic themselves.
 *
 * Four views over one set of tasks: month for planning the cycle, week for
 * assigning the coming days, day for the morning briefing, and timeline for the
 * run of work ahead irrespective of calendar boundaries.
 *
 * The task set comes from `/api/preventive`. Intervals are the manufacturer's
 * and are not adjusted by prediction — condition raises a task's priority,
 * never its due date.
 * ─────────────────────────────────────────────────────────────────────────── */

type CalendarView = 'month' | 'week' | 'day' | 'timeline';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const startOfDay = (value: number): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Monday-first week start for a given instant. */
const startOfWeek = (value: number): number => {
  const date = new Date(startOfDay(value));
  const shift = (date.getDay() + 6) % 7;
  return date.getTime() - shift * DAY_MS;
};

const startOfMonth = (value: number): number => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
};

const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const DAY_LONG_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** A compact task chip, used in every calendar cell. */
const TaskChip = ({ task, dense = false }: { task: PreventiveTask; dense?: boolean }) => {
  const tone = TASK_PRIORITY_TONE[task.priority];
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-1.5 py-1 ring-1 ring-inset',
        tone.bg,
        tone.ring,
        dense ? 'text-[10px]' : 'text-[10.5px]',
      )}
      title={`${task.taskName} — ${task.assetName} (${task.priority}, ${task.status})`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.color }} aria-hidden />
      <span className={cn('min-w-0 flex-1 truncate font-medium', tone.text)}>{task.assetId}</span>
      {dense ? null : <span className="min-w-0 flex-[2] truncate text-fg-dim">{task.taskName}</span>}
    </div>
  );
};

export const PreventiveWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { tasks } = usePredictive();
  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(() => Date.now());

  const open = useMemo(() => tasks.filter((task) => !task.completed), [tasks]);

  /** Tasks bucketed by the day they fall due. */
  const byDay = useMemo(() => {
    const map = new Map<number, PreventiveTask[]>();
    for (const task of tasks) {
      const key = startOfDay(task.dueDate);
      const held = map.get(key);
      if (held) held.push(task);
      else map.set(key, [task]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]);
    }
    return map;
  }, [tasks]);

  const today = startOfDay(Date.now());

  const monthCells = useMemo(() => {
    const first = startOfMonth(cursor);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => {
      const day = gridStart + index * DAY_MS;
      return {
        day,
        inMonth: new Date(day).getMonth() === new Date(cursor).getMonth(),
        isToday: day === today,
        tasks: byDay.get(day) ?? [],
      };
    });
  }, [cursor, byDay, today]);

  const weekCells = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => {
      const day = start + index * DAY_MS;
      return { day, isToday: day === today, tasks: byDay.get(day) ?? [] };
    });
  }, [cursor, byDay, today]);

  const dayTasks = useMemo(() => byDay.get(startOfDay(cursor)) ?? [], [byDay, cursor]);

  /** The run of work ahead, ignoring calendar boundaries. */
  const timeline = useMemo(
    () =>
      [...open]
        .sort((a, b) => a.dueDate - b.dueDate)
        .slice(0, 40)
        .map((task) => ({ task, day: startOfDay(task.dueDate) })),
    [open],
  );

  const step = (direction: 1 | -1) => {
    const date = new Date(cursor);
    if (view === 'month') date.setMonth(date.getMonth() + direction);
    else if (view === 'week') date.setDate(date.getDate() + direction * 7);
    else date.setDate(date.getDate() + direction);
    setCursor(date.getTime());
  };

  const metrics = useMemo(() => {
    const overdue = open.filter((task) => task.status === 'Overdue').length;
    const due = open.filter((task) => task.status === 'Due').length;
    const scheduled = open.filter((task) => task.status === 'Scheduled').length;
    const completed = tasks.filter((task) => task.completed).length;
    const critical = open.filter((task) => task.priority === 'Critical').length;

    return [
      { label: 'Upcoming', value: formatNumber(scheduled), caption: 'beyond the next seven days' },
      {
        label: 'Due this week',
        value: formatNumber(due),
        caption: 'inside seven days',
        color: due > 0 ? TONE_CLASS.warning.color : undefined,
      },
      {
        label: 'Overdue',
        value: formatNumber(overdue),
        caption: 'past the scheduled date',
        color: overdue > 0 ? TONE_CLASS.critical.color : undefined,
      },
      { label: 'Completed', value: formatNumber(completed), caption: 'signed off this cycle' },
      {
        label: 'Critical priority',
        value: formatNumber(critical),
        caption: 'raised by device condition',
        color: critical > 0 ? TONE_CLASS.serious.color : undefined,
      },
    ];
  }, [open, tasks]);

  const periodLabel =
    view === 'month'
      ? MONTH_FMT.format(new Date(cursor))
      : view === 'week'
        ? `Week of ${formatDate(startOfWeek(cursor))}`
        : view === 'day'
          ? DAY_LONG_FMT.format(new Date(cursor))
          : `${formatNumber(timeline.length)} scheduled visits ahead`;

  return (
    <WorkspaceFrame
      workspace={workspaceById('preventive')}
      onBack={onBack}
      actions={
        <Segmented
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'timeline', label: 'Timeline' },
          ]}
          value={view}
          onChange={(value) => setView(value as CalendarView)}
          size="sm"
          layoutId="calendar-view"
          ariaLabel="Calendar view"
        />
      }
    >
      <MetricBar metrics={metrics} />

      <Card flush className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-fg-dim" aria-hidden />
            <p className="text-[13px] font-semibold text-fg">{periodLabel}</p>
          </div>

          {view === 'timeline' ? null : (
            <div className="flex items-center gap-1.5">
              <IconButton icon={ChevronLeft} label="Previous period" size="sm" onClick={() => step(-1)} />
              <button
                type="button"
                onClick={() => setCursor(Date.now())}
                className="rounded-lg bg-overlay/[0.05] px-2.5 py-1.5 text-[11.5px] font-medium text-fg-muted ring-1 ring-inset ring-line/70 transition-colors duration-150 hover:bg-overlay/[0.08] hover:text-fg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              >
                Today
              </button>
              <IconButton icon={ChevronRight} label="Next period" size="sm" onClick={() => step(1)} />
            </div>
          )}
        </div>

        {/* ── Month ────────────────────────────────────────────────── */}
        {view === 'month' ? (
          <div className="p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((day) => (
                <p
                  key={day}
                  className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-faint"
                >
                  {day}
                </p>
              ))}
              {monthCells.map((cell) => (
                <div
                  key={cell.day}
                  className={cn(
                    'flex min-h-[5.25rem] flex-col gap-1 rounded-lg p-1.5 ring-1 ring-inset transition-colors duration-150',
                    cell.inMonth ? 'bg-overlay/[0.025] ring-line/50' : 'bg-transparent ring-transparent',
                    cell.isToday && 'bg-brand-500/[0.09] ring-brand-400/30',
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] tabular-nums',
                      cell.isToday ? 'font-semibold text-brand-200' : cell.inMonth ? 'text-fg-muted' : 'text-fg-faint',
                    )}
                  >
                    {new Date(cell.day).getDate()}
                  </p>
                  <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
                    {cell.tasks.slice(0, 2).map((task) => (
                      <TaskChip key={task.id} task={task} dense />
                    ))}
                    {cell.tasks.length > 2 ? (
                      <p className="px-1 text-[10px] text-fg-faint">+{cell.tasks.length - 2} more</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Week ─────────────────────────────────────────────────── */}
        {view === 'week' ? (
          <div className="scroll-x p-3">
            <div className="grid min-w-[54rem] grid-cols-7 gap-2">
              {weekCells.map((cell) => (
                <div
                  key={cell.day}
                  className={cn(
                    'flex min-h-[16rem] flex-col rounded-lg p-2 ring-1 ring-inset',
                    cell.isToday ? 'bg-brand-500/[0.09] ring-brand-400/30' : 'bg-overlay/[0.025] ring-line/50',
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
                    {WEEKDAYS[(new Date(cell.day).getDay() + 6) % 7]}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-[15px] font-semibold tabular-nums',
                      cell.isToday ? 'text-brand-200' : 'text-fg-soft',
                    )}
                  >
                    {new Date(cell.day).getDate()}
                  </p>
                  <div className="scroll-thin mt-2 flex flex-1 flex-col gap-1.5 overflow-y-auto">
                    {cell.tasks.length === 0 ? (
                      <p className="text-[10.5px] text-fg-faint">No work</p>
                    ) : (
                      cell.tasks.map((task) => <TaskChip key={task.id} task={task} dense />)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Day ──────────────────────────────────────────────────── */}
        {view === 'day' ? (
          <div className="p-4">
            {dayTasks.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                compact
                title="No maintenance scheduled"
                description="Nothing falls due on this date. Step to another day or open the month view to find the next visit."
              />
            ) : (
              <ul className="space-y-2">
                {dayTasks.map((task) => {
                  const tone = TASK_PRIORITY_TONE[task.priority];
                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-overlay/[0.03] p-3 ring-1 ring-inset ring-line/60"
                    >
                      <span
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: tone.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-fg">{task.taskName}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-fg-dim">
                          {task.assetName} · {task.assetId} · {task.category}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
                          tone.bg,
                          tone.text,
                          tone.ring,
                        )}
                      >
                        {task.priority}
                      </span>
                      <span className="w-20 shrink-0 text-right text-[11.5px] text-fg-muted">{task.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {/* ── Timeline ─────────────────────────────────────────────── */}
        {view === 'timeline' ? (
          <div className="scroll-thin max-h-[26rem] overflow-y-auto p-4">
            {timeline.length === 0 ? (
              <EmptyState icon={CalendarDays} compact title="No scheduled work outstanding" />
            ) : (
              <ol className="relative space-y-3 pl-5">
                <span className="absolute bottom-2 left-[3px] top-2 w-px bg-line" aria-hidden />
                {timeline.map(({ task, day }, index) => {
                  const tone = TASK_PRIORITY_TONE[task.priority];
                  const newDay = index === 0 || timeline[index - 1].day !== day;
                  return (
                    <li key={task.id} className="relative">
                      <span
                        className="absolute -left-5 top-2 h-[7px] w-[7px] rounded-full ring-2 ring-ink-950"
                        style={{ backgroundColor: tone.color }}
                        aria-hidden
                      />
                      {newDay ? (
                        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
                          {formatDate(day)} · {formatRelative(day)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-overlay/[0.03] px-3 py-2 ring-1 ring-inset ring-line/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-fg-soft">{task.taskName}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-fg-faint">
                            {task.assetName} · {task.assetId}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-[11px] font-medium', tone.text)}>{task.priority}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}
      </Card>

      <BoundedTable
        title="Schedule backlog"
        subtitle={`${open.length} open task${open.length === 1 ? '' : 's'}, soonest due first`}
        maxHeight="22rem"
      >
        <table className="w-full min-w-[50rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-ink-900">
            <tr className="border-b border-line/60">
              {['Task', 'Device', 'Due', 'Interval', 'Priority', 'Status'].map((head) => (
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
            {[...open]
              .sort((a, b) => a.dueDate - b.dueDate)
              .map((task) => {
                const tone = TASK_PRIORITY_TONE[task.priority];
                return (
                  <tr key={task.id} className="transition-colors duration-150 hover:bg-overlay/[0.03]">
                    <td className="px-4 py-2.5 text-[12.5px] font-medium text-fg">{task.taskName}</td>
                    <td className="px-4 py-2.5">
                      <p className="truncate text-[12px] text-fg-soft">{task.assetName}</p>
                      <p className="mt-0.5 text-[11px] text-fg-faint">
                        {task.assetId} · {task.category}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <p className="text-[12px] tabular-nums text-fg">{formatDate(task.dueDate)}</p>
                      <p className="mt-0.5 text-[10.5px] text-fg-faint">{formatRelative(task.dueDate)}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                      {task.intervalDays} d
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
                          tone.bg,
                          tone.text,
                          tone.ring,
                        )}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-fg-muted">{task.status}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </BoundedTable>

      <p className="text-[11.5px] leading-relaxed text-fg-dim">
        Task intervals come from the manufacturer&rsquo;s schedule and are not adjusted by prediction — condition raises
        a task&rsquo;s priority, never its due date. A technician assignment column is not shown because the platform
        does not yet record one; the schedule is published per device, not per engineer.
      </p>
    </WorkspaceFrame>
  );
};
