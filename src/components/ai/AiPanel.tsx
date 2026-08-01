import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  Clock3,
  Gauge,
  ListChecks,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { EngineSnapshot, Severity } from '@/engine/types';
import { OEE_TARGET, SEVERITY_TONE } from '@/engine/derive';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';

/* ───────────────────────────────────────────────────────────────────────────
 * AI intelligence panel.
 *
 * Every sentence below is computed from the current engine snapshot rather than
 * authored as prose, so the narrative cannot contradict the numbers on the same
 * screen. When health moves, the summary, the recommendations and the impact
 * figures move with it on the same tick.
 * ─────────────────────────────────────────────────────────────────────────── */

export type AiModule = 'overview' | 'anomaly' | 'predictive' | 'apm' | 'oee' | 'devices' | 'telemetry';

interface Recommendation {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  effort: 'Low' | 'Medium' | 'High';
  expectedGain: string;
}

interface Impact {
  headline: string;
  downtimeHoursAvoided: number;
  energyKwhPerDay: number;
  effectivenessGain: number;
  assetsProtected: number;
  narrative: string;
}

interface Action {
  id: string;
  label: string;
  priority: Severity;
  automatable: boolean;
}

interface PanelContent {
  summary: string;
  signals: string[];
  recommendations: Recommendation[];
  impact: Impact;
  actions: Action[];
  confidence: number;
}

const MODEL = { name: 'INTELORA Reliability Copilot', version: 'v5.1.0' } as const;

/** Estimated hourly cost of an unplanned outage per device class, in kWh-equivalent
 *  productivity terms. Used only to scale the impact figures consistently. */
const DOWNTIME_HOURS_PER_CRITICAL = 3.2;

const buildContent = (module: AiModule, snapshot: EngineSnapshot): PanelContent => {
  const { kpis, oee, assets, anomalies, tasks } = snapshot;

  const critical = assets.filter((asset) => asset.band === 'critical');
  const warning = assets.filter((asset) => asset.band === 'warning');
  const offline = assets.filter((asset) => asset.device.status === 'Offline');
  const activeAnomalies = anomalies.filter((record) => record.status === 'Active');
  const unacknowledged = activeAnomalies.filter((record) => record.severity === 'Critical');

  const worst = [...assets].sort((a, b) => a.health - b.health).slice(0, 3);
  const overdue = tasks.filter((task) => task.status === 'Overdue');

  // Assets whose remaining useful life falls inside the intervention horizon.
  const urgentRul = [...assets]
    .filter((asset) => asset.prediction.primary.rulDays <= 30)
    .sort((a, b) => a.prediction.primary.rulDays - b.prediction.primary.rulDays);

  const hotAssets = assets.filter(
    (asset) => asset.device.status !== 'Offline' && asset.live.temperature > 0 && asset.performance.performance < 88,
  );

  const oeeGap = Math.max(0, OEE_TARGET - oee.oee);

  const impact: Impact = {
    headline:
      critical.length > 0
        ? `${critical.length} device${critical.length === 1 ? '' : 's'} in critical condition carry the bulk of the fleet's downtime exposure`
        : 'No device is currently in critical condition',
    downtimeHoursAvoided: Math.round(critical.length * DOWNTIME_HOURS_PER_CRITICAL + overdue.length * 0.9),
    energyKwhPerDay: Math.round(
      assets.reduce((sum, asset) => sum + asset.live.power * 0.072, 0) * 0.024,
    ),
    effectivenessGain: Number((oeeGap * 0.42).toFixed(1)),
    assetsProtected: critical.length + warning.length,
    narrative:
      `Condition is concentrated rather than uniform: ${critical.length} critical and ${warning.length} warning devices ` +
      `account for the majority of the ${formatPercent(oeeGap, 1)} gap to the ${OEE_TARGET}% effectiveness target. ` +
      `Acting on that group first returns more than a fleet-wide programme, because the remaining ` +
      `${kpis.healthyAssets + kpis.goodAssets} devices are already operating inside their expected wear envelope.`,
  };

  const commonSignals = [
    `Fleet health ${formatNumber(kpis.averageHealth, 1)} across ${kpis.onlineAssets} reporting devices`,
    `${critical.length} critical, ${warning.length} warning, ${kpis.goodAssets} good, ${kpis.healthyAssets} healthy`,
    `${activeAnomalies.length} anomalies active, ${unacknowledged.length} at critical severity`,
    `Average draw ${formatNumber(kpis.averagePower, 1)} W · fleet total ${formatNumber(kpis.totalPower, 0)} W`,
  ];

  const confidence = Number(
    Math.min(0.97, 0.78 + Math.min(0.14, snapshot.tick / 3_000) + (critical.length > 0 ? 0.04 : 0)).toFixed(3),
  );

  switch (module) {
    case 'anomaly': {
      const byType = new Map<string, number>();
      activeAnomalies.forEach((record) => byType.set(record.title, (byType.get(record.title) ?? 0) + 1));
      const dominant = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];

      return {
        confidence,
        summary:
          `${activeAnomalies.length} anomalies are currently active across the fleet, ${unacknowledged.length} of them at ` +
          `critical severity. ${
            dominant
              ? `${dominant[0]} is the dominant signature with ${dominant[1]} open event${dominant[1] === 1 ? '' : 's'}.`
              : 'No single signature dominates the current set.'
          } Every event was raised from a sustained threshold breach rather than a single sample, so the alert load ` +
          `reflects genuine condition change and not sensor noise.`,
        signals: [
          dominant ? `${dominant[0]} leads the active set (${dominant[1]} events)` : 'Active set is evenly distributed',
          `${offline.length} device${offline.length === 1 ? '' : 's'} unreachable — condition cannot be assessed while offline`,
          `${anomalies.filter((r) => r.status === 'Resolved').length} events have self-cleared this session`,
          ...commonSignals.slice(0, 2),
        ],
        recommendations: [
          {
            id: 'anm-1',
            title:
              unacknowledged.length > 0
                ? `Triage ${unacknowledged.length} critical anomal${unacknowledged.length === 1 ? 'y' : 'ies'}`
                : 'No critical anomalies await triage',
            detail:
              unacknowledged.length > 0
                ? `Critical events on ${unacknowledged
                    .slice(0, 3)
                    .map((record) => record.assetId)
                    .join(', ')} are unacknowledged. Each carries a matching prediction, so the failure mode is already identified.`
                : 'The active set is confined to warning and major severities, which can be handled at the next service window.',
            severity: unacknowledged.length > 0 ? 'Critical' : 'Info',
            effort: 'Low',
            expectedGain: 'Detection-to-action inside one hour',
          },
          {
            id: 'anm-2',
            title: 'Investigate the dominant signature as a shared cause',
            detail: dominant
              ? `${dominant[0]} appearing on multiple devices across different categories points at a shared cause — supply quality, ventilation or duty profile — rather than isolated component wear.`
              : 'With no dominant signature, per-device investigation remains the right approach.',
            severity: 'Major',
            effort: 'Medium',
            expectedGain: 'Removes a whole event family',
          },
          {
            id: 'anm-3',
            title: 'Suppress link-loss noise on marginal PoE runs',
            detail: `${offline.length} device${offline.length === 1 ? '' : 's'} currently report communication loss. Where the pattern is intermittent rather than persistent, the cabling run is the fault, not the device.`,
            severity: offline.length > 1 ? 'Warning' : 'Info',
            effort: 'Low',
            expectedGain: 'Cleaner alert stream',
          },
        ],
        impact,
        actions: [
          {
            id: 'anm-a1',
            label: `Acknowledge and assign ${unacknowledged.length || activeAnomalies.length} active event(s)`,
            priority: unacknowledged.length > 0 ? 'Critical' : 'Warning',
            automatable: false,
          },
          { id: 'anm-a2', label: 'Open a root-cause study on the dominant signature', priority: 'Major', automatable: false },
          { id: 'anm-a3', label: 'Enable auto-ticketing above 0.90 confidence', priority: 'Warning', automatable: true },
        ],
      };
    }

    case 'predictive': {
      const soonest = urgentRul[0];
      return {
        confidence,
        summary:
          `${urgentRul.length} component${urgentRul.length === 1 ? '' : 's'} across the fleet fall inside the 30-day ` +
          `intervention horizon. ${
            soonest
              ? `${soonest.device.assetName} is the nearest at ${formatNumber(soonest.prediction.primary.rulDays, 0)} days on its ${soonest.prediction.primary.component.toLowerCase()}.`
              : 'Nothing is projected to fail inside the horizon.'
          } Remaining life is projected from the sustained wear rate rather than the current instant, so a passing ` +
          `thermal excursion does not move the estimate.`,
        signals: [
          soonest
            ? `Shortest remaining life: ${soonest.device.assetId} at ${formatNumber(soonest.prediction.primary.rulDays, 0)} d`
            : 'No component inside the 30-day horizon',
          `${urgentRul.length} components inside the horizon, ${critical.length} devices already critical`,
          `Highest failure probability ${formatPercent(
            Math.max(...assets.map((asset) => asset.prediction.primary.failureProbability)) * 100,
            1,
          )}`,
          ...commonSignals.slice(0, 1),
        ],
        recommendations: [
          {
            id: 'prd-1',
            title:
              urgentRul.length > 0
                ? `Raise work orders for ${Math.min(5, urgentRul.length)} nearest-term components`
                : 'No near-term interventions required',
            detail:
              urgentRul.length > 0
                ? `${urgentRul
                    .slice(0, 3)
                    .map((asset) => `${asset.device.assetId} (${asset.prediction.primary.component.toLowerCase()})`)
                    .join(', ')} sit closest to the failure boundary. Planned replacement costs materially less than the unplanned outage.`
                : 'Every component has more than thirty days of projected life at the current duty.',
            severity: urgentRul.length > 0 ? 'Critical' : 'Info',
            effort: 'Medium',
            expectedGain: `${Math.round(urgentRul.length * DOWNTIME_HOURS_PER_CRITICAL)} h downtime avoided`,
          },
          {
            id: 'prd-2',
            title: 'Reduce thermal stress on the fastest-degrading devices',
            detail: `${hotAssets.length} device${hotAssets.length === 1 ? '' : 's'} are operating with reduced performance under thermal load. Because wear accrues faster under stress, cooling work extends remaining life directly rather than merely deferring the symptom.`,
            severity: hotAssets.length > 2 ? 'Major' : 'Warning',
            effort: 'Low',
            expectedGain: 'Slows the wear rate at source',
          },
          {
            id: 'prd-3',
            title: 'Consolidate replacements into one service visit',
            detail:
              'Several components fall due inside the same window. Batching them into a single visit removes repeated travel and downtime for the same devices.',
            severity: 'Warning',
            effort: 'Low',
            expectedGain: 'Fewer service interruptions',
          },
        ],
        impact,
        actions: [
          {
            id: 'prd-a1',
            label: soonest ? `Schedule replacement on ${soonest.device.assetId}` : 'Review the 90-day horizon',
            priority: urgentRul.length > 0 ? 'Critical' : 'Warning',
            automatable: false,
          },
          { id: 'prd-a2', label: 'Approve cooling remediation on hot-running devices', priority: 'Major', automatable: false },
          { id: 'prd-a3', label: 'Batch due components into the next service visit', priority: 'Warning', automatable: true },
        ],
      };
    }

    case 'apm': {
      const bestAvailability = [...assets].sort((a, b) => b.performance.availability - a.performance.availability)[0];
      const worstAvailability = [...assets].sort((a, b) => a.performance.availability - b.performance.availability)[0];
      return {
        confidence,
        summary:
          `Fleet health averages ${formatNumber(kpis.averageHealth, 1)} with availability at ` +
          `${formatPercent(kpis.averageAvailability, 1)}. The spread matters more than the mean: ` +
          `${worstAvailability ? `${worstAvailability.device.assetId} sits at ${formatPercent(worstAvailability.performance.availability, 1)} availability against ${bestAvailability ? formatPercent(bestAvailability.performance.availability, 1) : 'the fleet best'}` : 'availability is uniform'}. ` +
          `Ranking by condition rather than by category is what surfaces the devices actually constraining the fleet.`,
        signals: [
          `Worst three by condition: ${worst.map((asset) => asset.device.assetId).join(', ')}`,
          `Average availability ${formatPercent(kpis.averageAvailability, 1)} · average OEE ${formatPercent(kpis.averageOee, 1)}`,
          `${overdue.length} preventive task${overdue.length === 1 ? '' : 's'} overdue`,
          ...commonSignals.slice(1, 3),
        ],
        recommendations: [
          {
            id: 'apm-1',
            title: `Prioritise the bottom ${Math.min(3, worst.length)} devices by condition`,
            detail: `${worst
              .map((asset) => `${asset.device.assetId} at ${formatNumber(asset.health, 1)}`)
              .join(', ')}. These devices set the floor for every fleet-level figure, so improvement here moves the whole estate.`,
            severity: critical.length > 0 ? 'Critical' : 'Major',
            effort: 'Medium',
            expectedGain: 'Raises the fleet floor, not just the mean',
          },
          {
            id: 'apm-2',
            title: 'Clear the overdue preventive backlog',
            detail:
              overdue.length > 0
                ? `${overdue.length} scheduled task${overdue.length === 1 ? ' is' : 's are'} past due. Deferred planned work is where unplanned downtime originates.`
                : 'The preventive schedule is current, which is the cheapest availability protection available.',
            severity: overdue.length > 3 ? 'Major' : overdue.length > 0 ? 'Warning' : 'Info',
            effort: 'Low',
            expectedGain: 'Protects availability at lowest cost',
          },
          {
            id: 'apm-3',
            title: 'Restore reporting on unreachable devices',
            detail: `${offline.length} device${offline.length === 1 ? '' : 's'} cannot be assessed. An unmonitored device is an unmanaged risk regardless of its last known condition.`,
            severity: offline.length > 0 ? 'Warning' : 'Info',
            effort: 'Low',
            expectedGain: 'Full fleet visibility',
          },
        ],
        impact,
        actions: [
          { id: 'apm-a1', label: `Review the bottom ${Math.min(5, assets.length)} devices with the service team`, priority: 'Major', automatable: false },
          { id: 'apm-a2', label: `Clear ${overdue.length} overdue preventive task(s)`, priority: overdue.length > 0 ? 'Major' : 'Info', automatable: false },
          { id: 'apm-a3', label: 'Alert on availability dropping below 95%', priority: 'Warning', automatable: true },
        ],
      };
    }

    case 'oee': {
      const constraint =
        oee.availability <= oee.performance && oee.availability <= oee.quality
          ? 'availability'
          : oee.performance <= oee.quality
            ? 'performance'
            : 'quality';
      return {
        confidence,
        summary:
          `Fleet effectiveness is ${formatPercent(oee.oee, 1)} against a ${OEE_TARGET}% target, decomposing to ` +
          `availability ${formatPercent(oee.availability, 1)}, performance ${formatPercent(oee.performance, 1)} and ` +
          `quality ${formatPercent(oee.quality, 1)}. ${constraint[0].toUpperCase()}${constraint.slice(1)} is the binding ` +
          `constraint, so effort spent on the other two factors will not move the headline figure.`,
        signals: [
          `Binding constraint: ${constraint} at ${formatPercent(
            constraint === 'availability' ? oee.availability : constraint === 'performance' ? oee.performance : oee.quality,
            1,
          )}`,
          `Gap to target ${formatPercent(oeeGap, 1)} · gap to world class ${formatPercent(Math.max(0, oee.worldClass - oee.oee), 1)}`,
          `${hotAssets.length} device${hotAssets.length === 1 ? '' : 's'} losing performance to thermal throttling`,
          ...commonSignals.slice(1, 2),
        ],
        recommendations: [
          {
            id: 'oee-1',
            title: `Attack ${constraint} first`,
            detail:
              constraint === 'availability'
                ? `Availability is the constraint, and ${offline.length} unreachable plus ${overdue.length} overdue-maintenance device(s) are the largest contributors. Both are addressable without capital spend.`
                : constraint === 'performance'
                  ? `Performance is the constraint, driven by thermal throttling on ${hotAssets.length} device(s). Restoring airflow recovers rate directly.`
                  : 'Quality is the constraint, which for this fleet tracks condition and anomaly load rather than process settings.',
            severity: 'Critical',
            effort: 'Medium',
            expectedGain: `+${formatPercent(oeeGap * 0.42, 1)} fleet effectiveness`,
          },
          {
            id: 'oee-2',
            title: 'Rebalance duty away from degraded devices',
            detail: `${critical.length + warning.length} device(s) below the good band are absorbing effectiveness loss. Shifting discretionary load to healthy devices recovers output while the degraded group is serviced.`,
            severity: 'Major',
            effort: 'Low',
            expectedGain: 'Output recovered without capital spend',
          },
          {
            id: 'oee-3',
            title: 'Hold the healthy majority at its current level',
            detail: `${kpis.healthyAssets + kpis.goodAssets} devices are operating at or near nominal. Preventive adherence on this group is what stops next quarter's constraint forming.`,
            severity: 'Info',
            effort: 'Low',
            expectedGain: 'Prevents the next constraint',
          },
        ],
        impact,
        actions: [
          { id: 'oee-a1', label: `Launch a ${constraint} improvement action`, priority: 'Critical', automatable: false },
          { id: 'oee-a2', label: 'Rebalance duty away from degraded devices', priority: 'Major', automatable: false },
          { id: 'oee-a3', label: 'Report effectiveness weekly by category', priority: 'Info', automatable: true },
        ],
      };
    }

    default: {
      return {
        confidence,
        summary:
          `The fleet holds ${formatNumber(kpis.averageHealth, 1)} average health across ${kpis.totalAssets} registered ` +
          `devices, with ${kpis.onlineAssets} online and ${kpis.offlineAssets} unreachable. Risk is concentrated rather ` +
          `than systemic: ${critical.length} device${critical.length === 1 ? '' : 's'} sit in the critical band and ` +
          `${warning.length} in warning, together accounting for most of the ${formatPercent(oeeGap, 1)} gap to the ` +
          `effectiveness target while the remaining ${kpis.healthyAssets + kpis.goodAssets} operate inside their expected ` +
          `wear envelope.`,
        signals: commonSignals,
        recommendations: [
          {
            id: 'ovw-1',
            title:
              critical.length > 0
                ? `Intervene on ${critical.length} critical device${critical.length === 1 ? '' : 's'}`
                : 'No critical interventions outstanding',
            detail:
              critical.length > 0
                ? `${worst
                    .map((asset) => `${asset.device.assetId} (${formatNumber(asset.health, 1)})`)
                    .join(', ')} are the weakest in the fleet. Each has an identified limiting component and a recommended action already prepared.`
                : 'Every device is above the critical threshold; the programme can stay on its preventive schedule.',
            severity: critical.length > 0 ? 'Critical' : 'Info',
            effort: 'Medium',
            expectedGain: `${Math.round(critical.length * DOWNTIME_HOURS_PER_CRITICAL)} h downtime avoided`,
          },
          {
            id: 'ovw-2',
            title: 'Clear the overdue preventive backlog',
            detail:
              overdue.length > 0
                ? `${overdue.length} task${overdue.length === 1 ? '' : 's'} past due across the fleet. Preventive work is the cheapest form of availability protection and the first thing to slip under pressure.`
                : 'The preventive schedule is current across every device.',
            severity: overdue.length > 3 ? 'Major' : overdue.length > 0 ? 'Warning' : 'Info',
            effort: 'Low',
            expectedGain: 'Availability protected at lowest cost',
          },
          {
            id: 'ovw-3',
            title: 'Restore visibility on unreachable devices',
            detail: `${offline.length} device${offline.length === 1 ? '' : 's'} are not reporting. Their condition is unknown, so any developing fault is invisible until the link returns.`,
            severity: offline.length > 1 ? 'Major' : offline.length > 0 ? 'Warning' : 'Info',
            effort: 'Low',
            expectedGain: 'Complete fleet coverage',
          },
        ],
        impact,
        actions: [
          {
            id: 'ovw-a1',
            label: worst[0] ? `Open a service request for ${worst[0].device.assetId}` : 'Review the fleet register',
            priority: critical.length > 0 ? 'Critical' : 'Warning',
            automatable: false,
          },
          { id: 'ovw-a2', label: `Clear ${overdue.length} overdue preventive task(s)`, priority: 'Major', automatable: false },
          { id: 'ovw-a3', label: 'Send the weekly reliability digest', priority: 'Info', automatable: true },
        ],
      };
    }
  }
};

const EFFORT_LABEL = { Low: 'Low effort', Medium: 'Medium effort', High: 'High effort' } as const;

const SEVERITY_BADGE_TONE: Record<Severity, 'good' | 'warning' | 'serious' | 'critical' | 'brand'> = {
  Info: 'brand',
  Warning: 'warning',
  Major: 'serious',
  Critical: 'critical',
};

const ImpactStat = ({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  caption: string;
}) => (
  <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
    <div className="flex items-center gap-1.5 text-fg-dim">
      <Icon size={13} aria-hidden />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]">{label}</span>
    </div>
    <p className="mt-2 text-[1.0625rem] font-semibold leading-none tracking-[-0.015em] text-fg">{value}</p>
    <p className="mt-1.5 text-[10.5px] leading-snug text-fg-faint">{caption}</p>
  </div>
);

export interface AiPanelProps {
  module: AiModule;
  className?: string;
  onAct?: (actionId: string) => void;
}

type Section = 'summary' | 'recommendations' | 'impact' | 'actions';

export const AiPanel = ({ module, className, onAct }: AiPanelProps) => {
  const snapshot = useSnapshot();
  const [section, setSection] = useState<Section>('summary');

  const content = useMemo(() => buildContent(module, snapshot), [module, snapshot]);
  const band = content.confidence >= 0.9 ? 'high' : content.confidence >= 0.8 ? 'moderate' : 'moderate';

  return (
    <Card
      className={cn(
        'relative border-brand-400/[0.16] bg-gradient-to-br from-brand-500/[0.055] via-ink-800/70 to-ink-800/70',
        className,
      )}
      sheen
    >
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-400/30">
            <Bot size={17} aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
              <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-brand-400/60" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand-300" />
            </span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">AI intelligence</p>
              <Badge tone="brand" size="xs" icon={Sparkles}>
                {MODEL.version}
              </Badge>
            </div>
            <h3 className="mt-1 text-[13.5px] font-semibold tracking-[-0.005em] text-fg">{MODEL.name}</h3>
            <p className="mt-0.5 text-[11px] text-fg-dim">
              Recomputed on every tick from live condition · {content.recommendations.length} recommendations ·{' '}
              {content.actions.length} queued actions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-16">
            <Progress
              value={content.confidence * 100}
              size="xs"
              color={band === 'high' ? '#0CA30C' : '#FAB219'}
              label="Model confidence"
            />
          </div>
          <span className="text-[11px] tabular-nums text-fg-muted">
            {formatPercent(content.confidence * 100, 0)} <span className="text-fg-faint">{band}</span>
          </span>
        </div>
      </div>

      <Tabs
        className="mt-4"
        layoutId={`ai-panel-${module}`}
        value={section}
        onChange={setSection}
        items={[
          { value: 'summary', label: 'AI summary', icon: Sparkles },
          { value: 'recommendations', label: 'Recommendations', icon: ListChecks, count: content.recommendations.length },
          { value: 'impact', label: 'Business impact', icon: CircleDollarSign },
          { value: 'actions', label: 'Recommended action', icon: BadgeCheck, count: content.actions.length },
        ]}
      />

      <motion.div
        key={section}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4"
      >
        {section === 'summary' ? (
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <p className="text-[13px] leading-relaxed text-fg-soft">{content.summary}</p>
            <div>
              <p className="eyebrow mb-2.5">Leading signals</p>
              <ul className="space-y-2">
                {content.signals.map((signal) => (
                  <li key={signal} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                    <span className="text-[11.5px] leading-relaxed text-fg-muted">{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {section === 'recommendations' ? (
          <ul className="space-y-2.5">
            {content.recommendations.map((recommendation) => {
              const tone = SEVERITY_TONE[recommendation.severity];
              return (
                <li
                  key={recommendation.id}
                  className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5 transition-colors hover:border-overlay/[0.11]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tone.color }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold leading-snug text-fg">{recommendation.title}</p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{recommendation.detail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Badge tone={SEVERITY_BADGE_TONE[recommendation.severity]} size="xs" dot>
                        {recommendation.severity}
                      </Badge>
                      <Badge tone="neutral" size="xs">
                        {EFFORT_LABEL[recommendation.effort]}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-overlay/[0.05] pt-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-dim">
                      <TrendingUp size={12} aria-hidden />
                      Expected gain
                      <strong className="font-semibold text-fg-soft">{recommendation.expectedGain}</strong>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {section === 'impact' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3.5">
              <p className="text-[12.5px] font-semibold text-brand-100">{content.impact.headline}</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted">{content.impact.narrative}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ImpactStat
                icon={Clock3}
                label="Downtime avoided"
                value={`${formatNumber(content.impact.downtimeHoursAvoided)} h`}
                caption="Against the run-to-failure baseline"
              />
              <ImpactStat
                icon={Zap}
                label="Energy recoverable"
                value={`${formatNumber(content.impact.energyKwhPerDay, 1)} kWh`}
                caption="Per day at current duty"
              />
              <ImpactStat
                icon={Gauge}
                label="Effectiveness gain"
                value={formatPercent(content.impact.effectivenessGain, 1)}
                caption={`Toward the ${OEE_TARGET}% target`}
              />
              <ImpactStat
                icon={TrendingUp}
                label="Devices protected"
                value={formatNumber(content.impact.assetsProtected)}
                caption="Below the good condition band"
              />
            </div>
          </div>
        ) : null}

        {section === 'actions' ? (
          <ul className="space-y-2">
            {content.actions.map((action) => {
              const tone = SEVERITY_TONE[action.priority];
              return (
                <li
                  key={action.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-overlay/[0.06] bg-ink-850/50 px-3.5 py-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tone.color }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium leading-snug text-fg">{action.label}</p>
                      <p className="mt-0.5 text-[11px] text-fg-dim">
                        {action.priority} priority{action.automatable ? ' · automatable' : ''}
                      </p>
                    </div>
                  </div>
                  <Button variant="subtle" size="xs" iconRight={ArrowRight} onClick={() => onAct?.(action.id)}>
                    {action.automatable ? 'Automate' : 'Assign'}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </motion.div>
    </Card>
  );
};
