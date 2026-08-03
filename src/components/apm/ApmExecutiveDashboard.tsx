import { useMemo } from 'react';
import {
  Award,
  Clock,
  DollarSign,
  HeartPulse,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type { ApmAssetDto, ApmFleetReliability } from '@/services/apm.types';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HealthMeter, RankList } from '@/components/common';
import { money } from '@/pages/apm/apmSelectors';

export interface ApmExecutiveDashboardProps {
  assets: ApmAssetDto[];
  reliability: ApmFleetReliability | undefined;
  onSelectAsset?: (assetId: string) => void;
}

export const ApmExecutiveDashboard = ({
  assets,
  reliability,
  onSelectAsset,
}: ApmExecutiveDashboardProps) => {
  const topCritical = useMemo(
    () => [...assets].sort((a, b) => b.criticality_score - a.criticality_score).slice(0, 5),
    [assets]
  );

  const mostExpensive = useMemo(
    () => [...assets].sort((a, b) => b.cost_exposure - a.cost_exposure).slice(0, 5),
    [assets]
  );

  const highestDowntime = useMemo(
    () => [...assets].sort((a, b) => b.downtime_hours - a.downtime_hours).slice(0, 5),
    [assets]
  );

  const lowestHealth = useMemo(
    () => [...assets].sort((a, b) => a.health_index - b.health_index).slice(0, 5),
    [assets]
  );

  const highestMttr = useMemo(
    () => [...assets].sort((a, b) => b.mttr_minutes - a.mttr_minutes).slice(0, 5),
    [assets]
  );

  return (
    <div className="space-y-6">
      {/* Fleet Reliability Summary Banner */}
      <Card className="p-5 bg-gradient-to-r from-ink-900 via-ink-850 to-brand-950/40 border-brand-500/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="text-brand-400" size={20} />
              <h3 className="text-base font-bold text-fg">Executive Reliability Summary</h3>
            </div>
            <p className="mt-1 text-xs text-fg-dim">
              High-level operational overview across {assets.length} connected estate assets
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-[10px] uppercase font-semibold text-fg-dim">Fleet Availability</div>
              <div className="text-xl font-bold text-emerald-400">
                {formatPercent(reliability?.availability_pct ?? 99.2, 1)}
              </div>
            </div>
            <div className="h-8 w-px bg-overlay/[0.08]" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-fg-dim">Fleet Mean MTBF</div>
              <div className="text-xl font-bold text-brand-400">
                {formatNumber(reliability?.mtbf_hours ?? 720, 1)} hrs
              </div>
            </div>
            <div className="h-8 w-px bg-overlay/[0.08]" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-fg-dim">Fleet Mean MTTR</div>
              <div className="text-xl font-bold text-amber-400">
                {formatNumber(reliability?.mttr_minutes ?? 42, 1)} mins
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 5 Key Executive Leaderboards */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Top Critical Assets */}
        <RankList
          title="Top Critical Assets"
          subtitle="Highest consequence scoring assets in the estate"
          eyebrow="Criticality"
          icon={ShieldAlert}
          items={topCritical.map((asset) => ({
            id: asset.asset_id,
            title: asset.asset_name,
            tag: asset.asset_id,
            subtitle: `${asset.category} · Score ${asset.criticality_score}`,
            value: <Badge tone="brand" size="xs">Class {asset.criticality_label}</Badge>,
            onClick: () => onSelectAsset?.(asset.asset_id),
          }))}
        />

        {/* Most Expensive Assets */}
        <RankList
          title="Most Expensive Assets"
          subtitle="Highest annual cost exposure & risk"
          eyebrow="Financial Exposure"
          icon={DollarSign}
          items={mostExpensive.map((asset) => ({
            id: asset.asset_id,
            title: asset.asset_name,
            tag: asset.asset_id,
            subtitle: `${asset.category} · Downtime ${asset.downtime_hours}h`,
            value: <span className="text-xs font-bold text-rose-400">{money(asset.cost_exposure)}</span>,
            onClick: () => onSelectAsset?.(asset.asset_id),
          }))}
        />

        {/* Lowest Health Assets */}
        <RankList
          title="Lowest Health Index"
          subtitle="Assets requiring immediate maintenance intervention"
          eyebrow="Condition"
          icon={HeartPulse}
          items={lowestHealth.map((asset) => ({
            id: asset.asset_id,
            title: asset.asset_name,
            tag: asset.asset_id,
            subtitle: `${asset.category} · Health ${asset.health_index}%`,
            value: <HealthMeter health={asset.health_index} width="w-16" />,
            onClick: () => onSelectAsset?.(asset.asset_id),
          }))}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Highest Downtime */}
        <RankList
          title="Highest Cumulative Downtime"
          subtitle="Assets experiencing maximum outage hours"
          eyebrow="Downtime"
          icon={Clock}
          items={highestDowntime.map((asset) => ({
            id: asset.asset_id,
            title: asset.asset_name,
            tag: asset.asset_id,
            subtitle: `${asset.category} · Downtime Cost ${money(asset.downtime_cost)}`,
            value: <span className="text-xs font-bold text-amber-400">{asset.downtime_hours} hrs</span>,
            onClick: () => onSelectAsset?.(asset.asset_id),
          }))}
        />

        {/* Highest MTTR */}
        <RankList
          title="Highest Mean Time to Repair (MTTR)"
          subtitle="Assets taking longest to restore following a failure"
          eyebrow="Repair Bottlenecks"
          icon={Wrench}
          items={highestMttr.map((asset) => ({
            id: asset.asset_id,
            title: asset.asset_name,
            tag: asset.asset_id,
            subtitle: `${asset.category} · Failures ${asset.failures}`,
            value: <span className="text-xs font-bold text-purple-400">{asset.mttr_minutes} mins</span>,
            onClick: () => onSelectAsset?.(asset.asset_id),
          }))}
        />
      </div>
    </div>
  );
};
