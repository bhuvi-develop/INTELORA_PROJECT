import { useCallback, useMemo } from 'react';
import { CircleDollarSign, Clock3, Cpu, Info, Layers, TrendingUp, Wrench } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatCurrency, formatNumber, formatPercent } from '@/utils/format';
import { AreaTrend, BarTrend, type SeriesDef } from '@/components/charts';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COST_MODEL, classifyRecord, faultClass, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { bucketJournal, ratioPct } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Business impact and financial ROI.
 *
 * This is the one page on the platform where a figure is not derived from
 * telemetry, and it says so everywhere. Avoided downtime is measured — actioned
 * events times the platform's own mean time to clear — but converting hours into
 * money needs a rate, and no sensor reports one.
 *
 * The two rates are stated, shown on the page, and applied linearly so that any
 * number here can be recomputed by hand. A model that buried them in a weighting
 * would produce a more impressive figure and a less useful one.
 * ─────────────────────────────────────────────────────────────────────────── */

export const BusinessImpactMetricPage = () => {
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();
  const { quality } = useAnomalyModule();

  const now = snapshot.at;
  const impact = quality.impact;

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  /** Value credited per actioned event, from the measured mean time to clear. */
  const valuePerActioned = useMemo(
    () => (impact.meanTimeToClearMinutes / 60) * COST_MODEL.downtimeRatePerHour,
    [impact.meanTimeToClearMinutes],
  );

  const trend = useMemo(
    () => bucketJournal(journal, now, { valuePerActioned }),
    [journal, now, valuePerActioned],
  );

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.device.assetId, asset])),
    [assets],
  );

  /** Savings split by device class — both terms, so the mix is visible. */
  const byCategory = useMemo(() => {
    const groups = new Map<string, { actioned: number; retained: Set<string> }>();

    for (const record of journal) {
      const asset = assetById.get(record.assetId);
      if (!asset) continue;
      const entry = groups.get(asset.category) ?? { actioned: 0, retained: new Set<string>() };

      if (record.status !== 'Active') entry.actioned += 1;
      if (record.severity === 'Critical' && record.status !== 'Active') {
        entry.retained.add(record.assetId);
      }
      groups.set(asset.category, entry);
    }

    return [...groups.entries()]
      .map(([category, entry]) => {
        const downtimeHours = (entry.actioned * impact.meanTimeToClearMinutes) / 60;
        const downtimeValue = downtimeHours * COST_MODEL.downtimeRatePerHour;
        const hardwareValue = entry.retained.size * COST_MODEL.unitReplacementCost;
        return {
          label: category,
          downtimeValue: Math.round(downtimeValue * 100) / 100,
          hardwareValue: Math.round(hardwareValue * 100) / 100,
          total: Math.round((downtimeValue + hardwareValue) * 100) / 100,
          actioned: entry.actioned,
          devices: entry.retained.size,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [journal, assetById, impact.meanTimeToClearMinutes]);

  /** Savings split by fault class — which failure modes are paying for themselves. */
  const byClass = useMemo(() => {
    const groups = new Map<string, { actioned: number; retained: Set<string>; color: string }>();

    for (const record of journal) {
      const rule = ruleFor(record);
      if (!rule) continue;
      const def = faultClass(rule.classId);
      const entry = groups.get(def.short) ?? { actioned: 0, retained: new Set<string>(), color: def.color };

      if (record.status !== 'Active') entry.actioned += 1;
      if (record.severity === 'Critical' && record.status !== 'Active') {
        entry.retained.add(record.assetId);
      }
      groups.set(def.short, entry);
    }

    return [...groups.entries()]
      .map(([label, entry]) => {
        const downtimeValue =
          ((entry.actioned * impact.meanTimeToClearMinutes) / 60) * COST_MODEL.downtimeRatePerHour;
        const hardwareValue = entry.retained.size * COST_MODEL.unitReplacementCost;
        return {
          label,
          total: Math.round((downtimeValue + hardwareValue) * 100) / 100,
          color: entry.color,
          actioned: entry.actioned,
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [journal, ruleFor, impact.meanTimeToClearMinutes]);

  const downtimeShare = ratioPct(
    impact.costSaved - impact.hardwareSaved,
    impact.costSaved,
  );

  const stats: DetailStat[] = [
    {
      key: 'total',
      label: 'Total value retained',
      value: formatCurrency(impact.costSaved),
      caption: `${downtimeShare === null ? '—' : formatPercent(downtimeShare, 0)} from avoided downtime, the rest from hardware`,
      icon: CircleDollarSign,
      accent: '#B45309',
    },
    {
      key: 'downtime',
      label: 'Downtime avoided',
      value: formatNumber(impact.downtimeHoursAvoided, 1),
      unit: 'h',
      caption: `${formatNumber(impact.actioned)} actioned events × ${formatNumber(impact.meanTimeToClearMinutes, 1)} min measured mean time to clear`,
      icon: Clock3,
      accent: SERIES[0],
    },
    {
      key: 'hardware',
      label: 'Hardware retained',
      value: formatCurrency(impact.hardwareSaved),
      caption: `${formatNumber(impact.devicesRetained)} device${impact.devicesRetained === 1 ? '' : 's'} whose critical events were closed rather than left standing`,
      icon: Cpu,
      accent: SERIES[2],
    },
    {
      key: 'actioned',
      label: 'Events actioned',
      value: formatNumber(impact.actioned),
      caption: 'Claimed by an engineer or cleared by the device inside its limit',
      icon: Wrench,
      accent: '#22C55E',
      tone: 'good',
    },
  ];

  const cumulativeSeries: SeriesDef[] = [
    { key: 'cumulativeValue', name: 'Cumulative value retained', color: '#B45309', unit: 'USD', decimals: 0 },
  ];

  return (
    <DetailShell
      title="Business Impact & Financial ROI Analytics"
      subtitle="What catching faults early was worth, with both commercial rates stated so every figure can be recomputed by hand."
      eyebrow={
        <>
          <Badge tone="neutral" size="sm" icon={CircleDollarSign}>
            {formatCurrency(impact.costSaved)} retained
          </Badge>
          <Badge tone="warning" size="sm" icon={Info}>
            2 assumed rates
          </Badge>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      {/* ─── The assumptions, stated before the charts that use them ────── */}
      <Card>
        <CardHeader
          title="Cost model"
          subtitle="The only two inputs on this platform that telemetry cannot supply"
          eyebrow="Assumptions"
          icon={Info}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Downtime rate',
              value: `${formatCurrency(COST_MODEL.downtimeRatePerHour)} / h`,
              note: 'Per device-hour out of service — assumed',
              assumed: true,
            },
            {
              label: 'Replacement cost',
              value: `${formatCurrency(COST_MODEL.unitReplacementCost)} / unit`,
              note: 'Mean endpoint replacement — assumed',
              assumed: true,
            },
            {
              label: 'Mean time to clear',
              value: `${formatNumber(impact.meanTimeToClearMinutes, 1)} min`,
              note: 'Measured by the platform from the journal',
              assumed: false,
            },
            {
              label: 'Value per actioned event',
              value: formatCurrency(valuePerActioned),
              note: 'Derived: mean time to clear × downtime rate',
              assumed: false,
            },
          ].map((cell) => (
            <div
              key={cell.label}
              className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3"
              style={cell.assumed ? { boxShadow: `inset 2px 0 0 0 ${STATUS_COLOR.warning}` } : undefined}
            >
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                {cell.label}
              </p>
              <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-fg">{cell.value}</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-dim">{cell.note}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-overlay/[0.06] pt-3.5 font-mono text-[11px] leading-relaxed text-fg-soft">
          value = (actioned × mttr_hours × {formatCurrency(COST_MODEL.downtimeRatePerHour)}) + (devices_retained
          × {formatCurrency(COST_MODEL.unitReplacementCost)})
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">
          Applied linearly on purpose. A weighted model would produce a larger number and a less checkable one —
          the two rates above are the only place a disagreement can enter, and they are on screen rather than
          buried in a coefficient. Substitute your own and every figure on this page scales with them.
        </p>
      </Card>

      <AreaTrend
        title="Cumulative value retained"
        subtitle="Running total across the session, credited as events are actioned"
        eyebrow="Accumulation"
        icon={TrendingUp}
        data={trend}
        series={cumulativeSeries}
        height={300}
        footnote="Each actioned event credits the measured mean time to clear at the assumed hourly rate. The curve steepens where the queue was being worked and flattens where it was not — the shape is the operational signal, the absolute value inherits the rate assumption."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Savings by device class"
          subtitle="Avoided downtime against retained hardware, per class"
          eyebrow="Mix"
          icon={Cpu}
          data={byCategory}
          series={[
            { key: 'downtimeValue', name: 'Avoided downtime', color: SERIES[0], unit: 'USD', decimals: 0 },
            { key: 'hardwareValue', name: 'Retained hardware', color: SERIES[2], unit: 'USD', decimals: 0 },
          ]}
          height={280}
          stacked
          footnote="The mix matters more than the total. A class dominated by downtime value is one where events are frequent and cheap to clear; one dominated by hardware value is where the detector prevented a replacement."
        />

        <BarTrend
          title="Value by fault class"
          subtitle="Which failure modes are paying for the detector"
          eyebrow="Attribution"
          icon={Layers}
          data={byClass}
          series={[{ key: 'total', name: 'Value retained', color: '#B45309', unit: 'USD', decimals: 0 }]}
          layout="horizontal"
          height={Math.max(240, byClass.length * 40)}
          categoryWidth={104}
          colorFor={(point) => String(point.color)}
          footnote="A class carrying high value with few actioned events is where each catch is expensive — usually thermal or degradation, where the alternative is a replacement rather than a reset."
        />
      </div>
    </DetailShell>
  );
};
