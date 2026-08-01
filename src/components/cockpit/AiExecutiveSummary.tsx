import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { asRiskTier, bandDef } from '@/engine/derive';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { PATHS, deviceDetailPath } from '@/routes/paths';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';

/* ───────────────────────────────────────────────────────────────────────────
 * AI executive intelligence.
 *
 * Written as an operations manager would brief an executive: what the estate is
 * doing, what specifically needs attention, and by when. Every clause is
 * computed from the current snapshot, so the briefing cannot drift from the
 * numbers shown beside it — including the sentence structure, which adapts to
 * whether there is anything wrong.
 * ─────────────────────────────────────────────────────────────────────────── */

const MODEL = { name: 'INTELORA Operations Copilot', version: 'v5.1.0' } as const;

interface Callout {
  assetId: string;
  assetName: string;
  reason: string;
}

export const AiExecutiveSummary = ({ className }: { className?: string }) => {
  const snapshot = useSnapshot();

  const briefing = useMemo(() => {
    const { assets, kpis, anomalies, tasks, operationalHealth, energy } = snapshot;

    const activeAnomalies = anomalies.filter((record) => record.status === 'Active');
    const atRisk = assets.filter((asset) => {
      const tier = asRiskTier(asset.riskTier);
      return tier === 'critical' || tier === 'high';
    });

    const soonest = [...assets].sort(
      (a, b) => a.prediction.primary.rulDays - b.prediction.primary.rulDays,
    )[0];

    const meanRul =
      assets.length === 0
        ? 0
        : assets.reduce((sum, asset) => sum + asset.prediction.primary.rulDays, 0) / assets.length;

    const overdue = tasks.filter((task) => task.status === 'Overdue');
    const offline = assets.filter((asset) => asset.device.status === 'Offline');

    /* Named callouts — the specific devices behind the headline. */
    const callouts: Callout[] = [];

    for (const asset of [...atRisk].sort((a, b) => a.health - b.health).slice(0, 2)) {
      const anomaly = activeAnomalies.find((record) => record.assetId === asset.device.assetId);
      callouts.push({
        assetId: asset.device.assetId,
        assetName: asset.device.assetName,
        reason: anomaly
          ? `${anomaly.title.toLowerCase()} with health at ${formatNumber(asset.health, 1)}`
          : `health at ${formatNumber(asset.health, 1)} with ${asset.prediction.primary.component.toLowerCase()} the limiting component`,
      });
    }

    for (const asset of offline.slice(0, 1)) {
      callouts.push({
        assetId: asset.device.assetId,
        assetName: asset.device.assetName,
        reason: 'not reporting, so its condition cannot be assessed',
      });
    }

    /* Sentence 1 — the headline state. */
    const stateWord =
      operationalHealth >= 92 ? 'strong' : operationalHealth >= 80 ? 'stable' : operationalHealth >= 65 ? 'strained' : 'poor';

    const sentences: string[] = [
      `Operational health is ${stateWord} at ${formatNumber(operationalHealth, 1)}%, with ${kpis.onlineAssets} of ${kpis.totalAssets} devices reporting and fleet condition averaging ${formatNumber(kpis.averageHealth, 1)}%.`,
    ];

    /* Sentence 2 — what needs attention, named. */
    if (callouts.length > 0) {
      sentences.push(
        callouts
          .map((callout, index) =>
            index === 0
              ? `${callout.assetName} is ${callout.reason}`
              : `${callout.assetName} is ${callout.reason}`,
          )
          .join('; ') + '.',
      );
    } else {
      sentences.push(
        'No device is currently in the critical or high-risk band, and no alert is awaiting triage.',
      );
    }

    /* Sentence 3 — the maintenance ask, with a timeframe. */
    if (soonest && soonest.prediction.primary.rulDays <= 30) {
      const days = Math.max(1, Math.round(soonest.prediction.primary.rulDays));
      const window = days <= 3 ? 'within three days' : days <= 7 ? 'within a week' : `within ${Math.ceil(days / 7)} weeks`;
      sentences.push(
        `Maintenance is recommended ${window}: ${soonest.device.assetName} has ${formatNumber(soonest.prediction.primary.rulDays, 0)} days of projected life on its ${soonest.prediction.primary.component.toLowerCase()} at ${formatPercent(soonest.prediction.primary.confidence * 100, 0)} confidence.`,
      );
    } else {
      sentences.push('No component falls inside the thirty-day intervention horizon, so the schedule can hold.');
    }

    /* Sentence 4 — the standing figures an executive tracks. */
    sentences.push(
      `Average remaining useful life across the estate is ${formatNumber(meanRul, 0)} days, effectiveness sits at ${formatPercent(snapshot.oee.oee, 1)}, and today's consumption is ${formatNumber(energy.todayKwh, 2)} kWh${
        Math.abs(energy.changePct) >= 0.5
          ? `, ${formatPercent(Math.abs(energy.changePct), 1)} ${energy.changePct > 0 ? 'above' : 'below'} yesterday`
          : ', level with yesterday'
      }.`,
    );

    /* Sentence 5 — only when there is a backlog worth raising. */
    if (overdue.length > 0) {
      sentences.push(
        `${overdue.length} preventive task${overdue.length === 1 ? ' is' : 's are'} past due; deferred planned work is the most common origin of unplanned downtime.`,
      );
    }

    const confidence = Math.min(0.97, 0.8 + Math.min(0.13, snapshot.tick / 2_600));

    return {
      text: sentences.join(' '),
      callouts,
      confidence,
      atRiskCount: atRisk.length,
      meanRul,
    };
  }, [snapshot]);

  return (
    <Card
      className={cn(
        'relative border-brand-400/[0.18] bg-gradient-to-br from-brand-500/[0.07] via-ink-800/70 to-ink-800/70',
        className,
      )}
      sheen
    >
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-400/30">
            <Bot size={18} aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
              <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-brand-400/60" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand-300" />
            </span>
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">AI executive intelligence</p>
              <Badge tone="brand" size="xs" icon={Sparkles}>
                {MODEL.version}
              </Badge>
            </div>
            <h3 className="mt-1 text-[13.5px] font-semibold tracking-[-0.005em] text-fg">{MODEL.name}</h3>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="w-20">
            <Progress
              value={briefing.confidence * 100}
              size="xs"
              color={briefing.confidence >= 0.9 ? '#0CA30C' : '#FAB219'}
              label="Briefing confidence"
            />
          </div>
          <span className="text-[11px] tabular-nums text-fg-muted">
            {formatPercent(briefing.confidence * 100, 0)} confidence
          </span>
        </div>
      </div>

      <motion.p
        key={snapshot.tick}
        initial={{ opacity: 0.65 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative mt-4 max-w-5xl text-[13.5px] leading-[1.75] text-fg-soft"
      >
        {briefing.text}
      </motion.p>

      {briefing.callouts.length > 0 ? (
        <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-overlay/[0.07] pt-3.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Named devices</span>
          {briefing.callouts.map((callout) => (
            <Link
              key={callout.assetId}
              to={deviceDetailPath(callout.assetId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-overlay/[0.05] px-2 py-1 text-[11px] font-medium text-fg-soft ring-1 ring-inset ring-overlay/10 transition-colors hover:bg-overlay/[0.09] hover:text-fg"
            >
              <span className="font-mono text-[10px] text-fg-muted">{callout.assetId}</span>
              {callout.assetName}
              <ArrowRight size={10} aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-overlay/[0.07] pt-3.5">
        <span className="flex items-baseline gap-1.5 text-[11px] text-fg-dim">
          Devices at risk
          <strong className="text-[13px] font-semibold tabular-nums text-fg">{briefing.atRiskCount}</strong>
        </span>
        <span className="flex items-baseline gap-1.5 text-[11px] text-fg-dim">
          Average remaining life
          <strong className="text-[13px] font-semibold tabular-nums text-fg">
            {formatNumber(briefing.meanRul, 0)} d
          </strong>
        </span>
        <span className="flex items-baseline gap-1.5 text-[11px] text-fg-dim">
          Condition band
          <strong className="text-[13px] font-semibold" style={{ color: bandDef(snapshot.kpis.averageHealth >= 95 ? 'healthy' : snapshot.kpis.averageHealth >= 80 ? 'good' : snapshot.kpis.averageHealth >= 65 ? 'warning' : 'critical').color }}>
            {bandDef(snapshot.kpis.averageHealth >= 95 ? 'healthy' : snapshot.kpis.averageHealth >= 80 ? 'good' : snapshot.kpis.averageHealth >= 65 ? 'warning' : 'critical').label}
          </strong>
        </span>

        <Link
          to={PATHS.prescriptive}
          className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand-300 transition-colors hover:text-brand-200"
        >
          Review recommended actions
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </Card>
  );
};
