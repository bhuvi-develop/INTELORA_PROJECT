import { useMemo } from 'react';
import {
  Activity,
  Clock,
  DollarSign,
  HeartPulse,
  ShieldAlert,
  Sparkles,
  Timer,
  Wrench,
} from 'lucide-react';
import type { ApmAssetDto } from '@/services/apm.types';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Progress } from '@/components/ui/Progress';
import { HealthMeter } from '@/components/common';
import { money } from '@/pages/apm/apmSelectors';

export interface ApmAssetDetailModalProps {
  asset: ApmAssetDto | null;
  isOpen: boolean;
  onClose: () => void;
  onRaiseWorkOrder?: (assetId: string) => void;
}

export const ApmAssetDetailModal = ({
  asset,
  isOpen,
  onClose,
  onRaiseWorkOrder,
}: ApmAssetDetailModalProps) => {
  if (!asset) return null;

  const pdmHealth = asset.inputs?.predictive?.health_score ?? asset.health_index;
  const rulDays = asset.inputs?.predictive?.rul_days ?? 0;
  const failureProb = asset.inputs?.predictive?.failure_probability ?? 0;

  const factors = useMemo(() => asset.criticality_factors || [], [asset]);

  const lifecycleStages = [
    { name: 'Commissioned', active: true },
    { name: 'Operational', active: asset.status === 'Online' },
    { name: 'Maintenance', active: asset.open_work_orders > 0 },
    { name: 'Derated', active: pdmHealth < 65 },
    { name: 'Retired', active: false },
  ];

  const recAction = asset.recommended_action as { action?: string; rationale?: string; confidence?: number } | undefined;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="xl"
      title={`${asset.asset_name} (${asset.asset_id})`}
      subtitle={`${asset.category} · ${asset.brand} · Status: ${asset.status}`}
    >
      <div className="space-y-6 pt-2">
        {/* Top KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-3.5 bg-ink-850/50">
            <div className="flex items-center justify-between text-fg-dim text-xs">
              <span>Asset Health Index</span>
              <HeartPulse size={16} className="text-brand-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-fg">{asset.health_index}</span>
              <span className="text-xs text-fg-dim">/ 100</span>
            </div>
            <HealthMeter health={asset.health_index} className="mt-2" />
          </Card>

          <Card className="p-3.5 bg-ink-850/50">
            <div className="flex items-center justify-between text-fg-dim text-xs">
              <span>Remaining Useful Life</span>
              <Timer size={16} className="text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-fg">{Math.round(rulDays)}</span>
              <span className="text-xs text-fg-dim">days</span>
            </div>
            <p className="mt-2 text-[11px] text-fg-dim">
              30d Failure Prob:{' '}
              <span className="font-semibold text-amber-400">{formatPercent(failureProb * 100, 1)}</span>
            </p>
          </Card>

          <Card className="p-3.5 bg-ink-850/50">
            <div className="flex items-center justify-between text-fg-dim text-xs">
              <span>Availability & MTBF</span>
              <Clock size={16} className="text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-fg">{formatPercent(asset.availability_pct, 1)}</span>
            </div>
            <p className="mt-2 text-[11px] text-fg-dim">
              MTBF: <span className="font-medium text-fg">{asset.mtbf_hours}h</span> · MTTR:{' '}
              <span className="font-medium text-fg">{asset.mttr_minutes}m</span>
            </p>
          </Card>

          <Card className="p-3.5 bg-ink-850/50">
            <div className="flex items-center justify-between text-fg-dim text-xs">
              <span>Cost Exposure</span>
              <DollarSign size={16} className="text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-400">{money(asset.cost_exposure)}</span>
            </div>
            <p className="mt-2 text-[11px] text-fg-dim">
              Downtime Cost: <span className="font-medium text-fg">{money(asset.downtime_cost)}</span>
            </p>
          </Card>
        </div>

        {/* Action Recommendation Banner */}
        {recAction?.action && (
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="text-brand-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-400">
                    Recommended Action ({asset.priority})
                  </span>
                  {recAction.confidence !== undefined && (
                    <Badge tone="brand" size="xs">
                      Confidence {formatPercent(recAction.confidence * 100, 0)}
                    </Badge>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-fg">{recAction.action}</h4>
                {recAction.rationale && <p className="text-xs text-fg-dim leading-relaxed">{recAction.rationale}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Section: Criticality Engine Factors */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-dim flex items-center gap-2">
            <ShieldAlert size={14} className="text-brand-400" />
            Criticality Factors (Consequence Model)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {factors.map((f: { key?: string; label?: string; score?: number }, idx: number) => {
              const labelStr = String(f.label || f.key || `Factor ${idx + 1}`);
              const scoreNum = Number(f.score ?? 0);
              return (
                <div key={f.key || idx} className="rounded-lg border border-overlay/[0.08] bg-ink-850/30 p-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-fg-soft">{labelStr}</span>
                    <span className="font-bold text-fg tabular-nums">{scoreNum}/100</span>
                  </div>
                  <Progress value={scoreNum} size="xs" color={scoreNum > 70 ? '#f43f5e' : '#3b82f6'} className="mt-2" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: Asset Lifecycle & Maintenance History */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-dim flex items-center gap-2">
              <Activity size={14} className="text-brand-400" />
              Asset Lifecycle State
            </h3>
            <div className="rounded-xl border border-overlay/[0.08] bg-ink-850/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-dim">Lifecycle Decision</span>
                <Badge tone={asset.lifecycle_decision === 'Retire' ? 'critical' : 'brand'} size="sm">
                  {asset.lifecycle_decision}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-dim">Effective Age</span>
                <span className="font-medium text-fg">{asset.effective_age_days} days</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-dim">Ageing Factor</span>
                <span className="font-medium text-fg">{formatNumber(asset.ageing_factor, 2)}x</span>
              </div>

              {/* Timeline */}
              <div className="pt-2 border-t border-overlay/[0.06]">
                <div className="relative flex items-center justify-between">
                  {lifecycleStages.map((stage, index) => (
                    <div key={stage.name} className="flex flex-col items-center z-10">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                          stage.active
                            ? 'bg-brand-500 text-white ring-4 ring-brand-500/20'
                            : 'bg-ink-700 text-fg-dim'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span className="mt-1 text-[10px] font-medium text-fg">{stage.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-dim flex items-center gap-2">
              <Wrench size={14} className="text-brand-400" />
              Work Orders & Maintenance
            </h3>
            <div className="rounded-xl border border-overlay/[0.08] bg-ink-850/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-dim">Open Work Orders</span>
                <span className="text-sm font-bold text-fg tabular-nums">{asset.open_work_orders}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-dim">Failures Observed</span>
                <span className="font-medium text-fg">{asset.failures}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-dim">Downtime Hours</span>
                <span className="font-medium text-fg">{asset.downtime_hours} hrs</span>
              </div>
              <div className="pt-2 border-t border-overlay/[0.06] flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  icon={Wrench}
                  onClick={() => {
                    onClose();
                    onRaiseWorkOrder?.(asset.asset_id);
                  }}
                >
                  Raise Work Order
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
