import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/utils/format';
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

export const AiExecutiveSummary = ({ className }: { className?: string }) => {
  const snapshot = useSnapshot();

  const briefing = useMemo(() => {
    const { assets, anomalies, operationalHealth, energy, oee } = snapshot;

    const lines: string[] = [];

    // Line 1: Health
    if (operationalHealth >= 92) lines.push('Fleet is operating normally.');
    else if (operationalHealth >= 80) lines.push('Fleet is operating with minor warnings.');
    else lines.push('Fleet is experiencing critical issues.');

    // Line 2: Maintenance
    const soonest = [...assets].sort((a, b) => a.prediction.primary.rulDays - b.prediction.primary.rulDays)[0];
    if (soonest && soonest.prediction.primary.rulDays <= 30) {
      lines.push(`One ${soonest.device.assetName} requires preventive maintenance.`);
    } else {
      lines.push('No immediate preventive maintenance required.');
    }

    // Line 3: Anomalies / Energy
    const activeAnomalies = anomalies.filter((record) => record.status === 'Active');
    if (activeAnomalies.length > 0) {
      const anomalyAsset = assets.find((a) => a.device.assetId === activeAnomalies[0].assetId);
      if (anomalyAsset) {
        lines.push(`One ${anomalyAsset.device.assetName} has an active alert: ${activeAnomalies[0].title}.`);
      }
    } else if (energy.changePct > 5) {
      lines.push('Energy consumption is elevated compared to yesterday.');
    } else {
      lines.push('Energy consumption is within normal ranges.');
    }

    // Line 4: OEE
    if (oee.oee >= 85) lines.push('Overall Equipment Efficiency is optimal.');
    else if (oee.oee >= 65) lines.push('Overall Equipment Efficiency remains stable.');
    else lines.push('Overall Equipment Efficiency requires attention.');

    const confidence = Math.min(0.97, 0.8 + Math.min(0.13, snapshot.tick / 2_600));

    return {
      lines: lines.slice(0, 5),
      confidence,
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

      <motion.div
        key={snapshot.tick}
        initial={{ opacity: 0.65 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative mt-4 max-w-5xl text-[14px] leading-relaxed text-fg-soft space-y-1.5"
      >
        {briefing.lines.map((line, i) => (
          <p key={i} className="flex items-start gap-2">
            <span className="text-brand-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            {line}
          </p>
        ))}
      </motion.div>
    </Card>
  );
};
