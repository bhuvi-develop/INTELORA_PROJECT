import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { usePredictive } from './context';
import { HubCard, type CardStatus } from './HubCard';
import { WORKSPACES, type WorkspaceId } from './navigation';
import { HORIZON_DAYS, bySoonestFailure, formatDays } from './shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * The launcher hub.
 *
 * The module's landing state, and the only one: eight cards, no charts, no
 * tables, no recommendation feed. Rendering the detail of every workspace on
 * arrival is what produced the endless vertical feed this replaces.
 *
 * Locked to the viewport. The grid claims the height the shell leaves after its
 * header and padding, and both rows share it, so the hub never produces a page
 * scrollbar on a desktop viewport. Below `md` the lock is released — eight
 * cards compressed into a phone screen would be eight unreadable slivers, and a
 * scroll is the honest answer there.
 * ─────────────────────────────────────────────────────────────────────────── */

interface CardFigure {
  metric: string;
  metricUnit?: string;
  status: string;
  statusKind: CardStatus;
}

export const PredictiveHub = () => {
  const { rows, components, tasks, assets, signals, open } = usePredictive();

  const figures = useMemo<Record<WorkspaceId, CardFigure>>(() => {
    const ranked = bySoonestFailure(rows);
    const soonest = ranked[0];

    const inHorizon = components.filter((row) => row.rulDays <= HORIZON_DAYS);
    const criticalDevices = rows.filter((row) => row.rulDays <= 7).length;

    const highestRisk = rows.reduce(
      (peak, row) => (row.failureProbability > peak ? row.failureProbability : peak),
      0,
    );
    const likely = rows.filter((row) => row.failureProbability >= 0.45).length;

    const worstWear = components.reduce((peak, row) => (row.wear > peak ? row.wear : peak), 0);
    const wornParts = components.filter((row) => row.wear >= 0.6).length;

    const openTasks = tasks.filter((task) => !task.completed);
    const overdue = openTasks.filter((task) => task.status === 'Overdue').length;
    const dueSoon = openTasks.filter((task) => task.status === 'Due').length;

    const immediate = assets.filter((asset) => asset.prescriptive.urgency === 'Immediate').length;
    const scheduled = assets.filter((asset) => asset.prescriptive.urgency === 'Scheduled').length;

    const queueCritical = components.filter((row) => row.maintenancePriority === 'Critical').length;

    const meanConfidence =
      components.length === 0
        ? 0
        : components.reduce((sum, row) => sum + row.confidence, 0) / components.length;
    const hybrid = components.filter((row) => row.modelVersion.startsWith('hybrid')).length;

    return {
      rul: {
        metric: soonest ? formatDays(soonest.rulDays) : '—',
        metricUnit: soonest ? 'min RUL' : undefined,
        status: criticalDevices > 0 ? `${criticalDevices} under 7d` : soonest ? 'TRACKING' : 'NO DATA',
        statusKind: criticalDevices > 0 ? 'critical' : soonest && soonest.rulDays <= HORIZON_DAYS ? 'warning' : 'normal',
      },
      probability: {
        metric: rows.length > 0 ? formatPercent(highestRisk * 100, 1) : '—',
        metricUnit: rows.length > 0 ? 'max risk' : undefined,
        status: likely > 0 ? `${likely} likely` : 'LOW',
        statusKind: highestRisk >= 0.7 ? 'critical' : likely > 0 ? 'warning' : 'normal',
      },
      components: {
        metric: formatNumber(inHorizon.length),
        metricUnit: `of ${components.length} parts`,
        status: wornParts > 0 ? `${wornParts} past 60%` : 'NORMAL',
        statusKind: worstWear >= 0.8 ? 'critical' : wornParts > 0 ? 'warning' : 'normal',
      },
      preventive: {
        metric: formatNumber(openTasks.length),
        metricUnit: 'open tasks',
        status: overdue > 0 ? `${overdue} overdue` : dueSoon > 0 ? `${dueSoon} due` : 'ON SCHEDULE',
        statusKind: overdue > 0 ? 'critical' : dueSoon > 0 ? 'warning' : 'normal',
      },
      prescriptive: {
        metric: formatNumber(immediate),
        metricUnit: 'immediate',
        status: immediate > 0 ? 'ACTION NOW' : scheduled > 0 ? `${scheduled} scheduled` : 'NO ACTION',
        statusKind: immediate > 0 ? 'critical' : scheduled > 0 ? 'warning' : 'normal',
      },
      queue: {
        metric: formatNumber(inHorizon.length),
        metricUnit: 'in backlog',
        status: queueCritical > 0 ? `${queueCritical} critical` : 'CLEAR',
        statusKind: queueCritical > 0 ? 'critical' : inHorizon.length > 0 ? 'warning' : 'normal',
      },
      analytics: {
        metric: components.length > 0 ? formatPercent(meanConfidence * 100, 1) : '—',
        metricUnit: components.length > 0 ? 'confidence' : undefined,
        status: hybrid > 0 ? `${hybrid} regression` : 'WEAR-RATE',
        statusKind: meanConfidence > 0 && meanConfidence < 0.75 ? 'warning' : 'normal',
      },
      reports: {
        metric: formatNumber(components.length),
        metricUnit: 'records',
        status: signals.length > 0 ? `${signals.length} signals` : 'READY',
        statusKind: 'idle',
      },
    };
  }, [rows, components, tasks, assets, signals]);

  return (
    <div
      className={cn(
        'flex flex-col',
        // The shell leaves 100dvh less its header and vertical padding. Claiming
        // exactly that keeps the hub inside one screen at every breakpoint.
        'md:h-[calc(100dvh-8.5rem)] md:overflow-hidden lg:h-[calc(100dvh-9.5rem)]',
      )}
    >
      <motion.p
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mb-4 shrink-0 text-[12px] leading-relaxed text-fg-dim xl:mb-5"
      >
        What is likely to fail, when it will fail, and what should be prepared today. Select a workspace to open it —
        every figure below is published by the platform&rsquo;s prediction service and updates on its own.
      </motion.p>

      <div className="grid min-h-0 flex-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2">
        {WORKSPACES.map((workspace, index) => {
          const figure = figures[workspace.id];
          return (
            <motion.div
              key={workspace.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-[10.5rem] xl:min-h-0"
            >
              <HubCard
                workspace={workspace}
                metric={figure.metric}
                metricUnit={figure.metricUnit}
                status={figure.status}
                statusKind={figure.statusKind}
                onOpen={() => open(workspace.id)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
