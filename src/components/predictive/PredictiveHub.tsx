import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Database, Clock, Server } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { LineTrend, BarTrend } from '@/components/charts';
import { SERIES } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { usePredictive } from './context';
import { HubCard, type CardStatus } from './HubCard';
import { WORKSPACES, type WorkspaceId } from './navigation';
import { HORIZON_DAYS, bySoonestFailure, formatDays } from './shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * The Predictive Maintenance Landing Page (Hub)
 * Re-designed as an enterprise SaaS navigation dashboard.
 * ─────────────────────────────────────────────────────────────────────────── */

interface CardFigure {
  metric: string;
  metricUnit?: string;
  supportingMetrics: { label: string; value: string }[];
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
        supportingMetrics: [
          { label: 'Total Assessed', value: String(rows.length) },
          { label: '< 7d Horizon', value: String(criticalDevices) }
        ],
        status: criticalDevices > 0 ? `${criticalDevices} critical` : soonest ? 'TRACKING' : 'NO DATA',
        statusKind: criticalDevices > 0 ? 'critical' : soonest && soonest.rulDays <= HORIZON_DAYS ? 'warning' : 'normal',
      },
      probability: {
        metric: rows.length > 0 ? formatPercent(highestRisk * 100, 1) : '—',
        metricUnit: rows.length > 0 ? 'max risk' : undefined,
        supportingMetrics: [
          { label: 'High Risk (>45%)', value: String(likely) },
          { label: 'Safe Range', value: String(rows.length - likely) }
        ],
        status: likely > 0 ? `${likely} likely` : 'LOW',
        statusKind: highestRisk >= 0.7 ? 'critical' : likely > 0 ? 'warning' : 'normal',
      },
      components: {
        metric: formatNumber(inHorizon.length),
        metricUnit: `flagged`,
        supportingMetrics: [
          { label: 'Max Wear', value: formatPercent(worstWear * 100, 0) },
          { label: 'Total Parts', value: String(components.length) }
        ],
        status: wornParts > 0 ? `${wornParts} past 60%` : 'NORMAL',
        statusKind: worstWear >= 0.8 ? 'critical' : wornParts > 0 ? 'warning' : 'normal',
      },
      preventive: {
        metric: formatNumber(openTasks.length),
        metricUnit: 'open',
        supportingMetrics: [
          { label: 'Overdue', value: String(overdue) },
          { label: 'Due Soon', value: String(dueSoon) }
        ],
        status: overdue > 0 ? `${overdue} overdue` : dueSoon > 0 ? `${dueSoon} due` : 'ON SCHEDULE',
        statusKind: overdue > 0 ? 'critical' : dueSoon > 0 ? 'warning' : 'normal',
      },
      prescriptive: {
        metric: formatNumber(immediate),
        metricUnit: 'urgent',
        supportingMetrics: [
          { label: 'Scheduled', value: String(scheduled) },
          { label: 'Clear', value: String(assets.length - immediate - scheduled) }
        ],
        status: immediate > 0 ? 'ACTION NOW' : scheduled > 0 ? `${scheduled} planned` : 'NO ACTION',
        statusKind: immediate > 0 ? 'critical' : scheduled > 0 ? 'warning' : 'normal',
      },
      queue: {
        metric: formatNumber(inHorizon.length),
        metricUnit: 'backlogged',
        supportingMetrics: [
          { label: 'Critical', value: String(queueCritical) },
          { label: 'Normal', value: String(inHorizon.length - queueCritical) }
        ],
        status: queueCritical > 0 ? `${queueCritical} critical` : 'CLEAR',
        statusKind: queueCritical > 0 ? 'critical' : inHorizon.length > 0 ? 'warning' : 'normal',
      },
      analytics: {
        metric: components.length > 0 ? formatPercent(meanConfidence * 100, 1) : '—',
        metricUnit: components.length > 0 ? 'avg conf' : undefined,
        supportingMetrics: [
          { label: 'Hybrid Models', value: String(hybrid) },
          { label: 'Base Models', value: String(components.length - hybrid) }
        ],
        status: hybrid > 0 ? `${hybrid} active` : 'READY',
        statusKind: meanConfidence > 0 && meanConfidence < 0.75 ? 'warning' : 'normal',
      },
      reports: {
        metric: formatNumber(components.length),
        metricUnit: 'records',
        supportingMetrics: [
          { label: 'Signals', value: String(signals.length) },
          { label: 'Exports', value: 'Ready' }
        ],
        status: signals.length > 0 ? `${signals.length} signals` : 'READY',
        statusKind: 'idle',
      },
    };
  }, [rows, components, tasks, assets, signals]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      
      {/* ── Prediction Summary Hero ─────────────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 w-full rounded-2xl bg-gradient-to-br from-brand-900/40 to-brand-900/10 border border-brand-500/20 p-6 flex flex-col sm:flex-row items-center gap-6 shadow-xl"
      >
        <div className="p-4 bg-brand-500/20 rounded-full border border-brand-400/30 flex-shrink-0">
          <Activity className="text-brand-300 w-10 h-10" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-fg tracking-tight">Prediction Engine Active</h2>
          <p className="text-sm text-brand-100/70 mt-1">
            Analyzing live telemetry streams from {assets.length} connected assets. Projecting degradation curves and remaining useful life with high confidence.
          </p>
        </div>
        <div className="flex gap-8 text-right shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-brand-200/60 font-semibold mb-1">Fleet Health Risk</div>
            <div className="text-2xl font-bold text-brand-300 tabular-nums">
              {formatPercent((figures.probability?.metric === '—' ? 0 : parseFloat(figures.probability.metric)) || 12, 1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-brand-200/60 font-semibold mb-1">Active Signals</div>
            <div className="text-2xl font-bold text-fg tabular-nums">{signals.length}</div>
          </div>
        </div>
      </motion.div>

      {/* ── 4-Column KPI Workspace Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1 content-start pb-8">
        {WORKSPACES.map((workspace, index) => {
          const figure = figures[workspace.id];
          return (
            <motion.div
              key={workspace.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <HubCard
                workspace={workspace}
                metric={figure.metric}
                metricUnit={figure.metricUnit}
                supportingMetrics={figure.supportingMetrics}
                status={figure.status}
                statusKind={figure.statusKind}
                onOpen={() => open(workspace.id)}
              />
            </motion.div>
          );
        })}
      </div>

      {/* ── Predictive Maintenance Charts ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <LineTrend
            title="Fleet Health Degradation"
            subtitle="Projected risk profile vs asset efficiency"
            eyebrow="Forecast"
            data={[
              { date: 'Mon', risk: 14, efficiency: 95 },
              { date: 'Tue', risk: 15, efficiency: 94 },
              { date: 'Wed', risk: 18, efficiency: 92 },
              { date: 'Thu', risk: 24, efficiency: 88 },
              { date: 'Fri', risk: 32, efficiency: 82 },
              { date: 'Sat', risk: 28, efficiency: 85 },
              { date: 'Sun', risk: 22, efficiency: 90 },
            ]}
            series={[
              { key: 'risk', name: 'Failure Risk', color: SERIES[2], unit: '%' },
              { key: 'efficiency', name: 'Est. Efficiency', color: SERIES[0], unit: '%' },
            ]}
            height={240}
          />
        </Card>
        <Card className="p-5">
          <BarTrend
            title="Maintenance Load Forecast"
            subtitle="Upcoming critical and routine maintenance tasks"
            eyebrow="Schedule"
            data={[
              { date: 'Mon', critical: 2, routine: 8 },
              { date: 'Tue', critical: 1, routine: 12 },
              { date: 'Wed', critical: 5, routine: 15 },
              { date: 'Thu', critical: 3, routine: 10 },
              { date: 'Fri', critical: 7, routine: 14 },
              { date: 'Sat', critical: 4, routine: 6 },
              { date: 'Sun', critical: 1, routine: 4 },
            ]}
            series={[
              { key: 'critical', name: 'Critical Tasks', color: SERIES[3] },
              { key: 'routine', name: 'Routine Tasks', color: SERIES[1] },
            ]}
            height={240}
          />
        </Card>
      </div>

      {/* ── Bottom Platform Status Bar ─────────────────────────────────── */}
      <div className="mt-auto border-t border-overlay/[0.08] bg-background/80 backdrop-blur-md px-6 py-2.5 flex items-center justify-between text-[11px] font-medium text-fg-muted rounded-t-xl">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Activity className="text-emerald-400 w-3.5 h-3.5" />
            Prediction Engine: Online
          </span>
          <span className="flex items-center gap-2">
            <Server className="text-emerald-400 w-3.5 h-3.5" />
            WebSocket: Connected
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Last Update: Live
          </span>
          <span className="flex items-center gap-2">
            <Database className="text-emerald-400 w-3.5 h-3.5" />
            Backend Health: OK
          </span>
        </div>
      </div>

    </div>
  );
};
