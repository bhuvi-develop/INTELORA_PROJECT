import { useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { RISK_TIERS, asRiskTier, type RiskTier } from '@/engine/derive';
import { ON_FILL_INK, densityRampColor, needsDarkInk } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChartFrame } from './ChartFrame';

/* ───────────────────────────────────────────────────────────────────────────
 * Risk heat map: device category against operational risk tier.
 *
 * Magnitude rides a single-hue sequential ramp — lightness carries the count —
 * and every cell states its exact number, so the reading survives print and
 * colour-vision deficiency. The tier axis is ordered worst-to-best so the
 * top-left corner is always where attention belongs.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface RiskHeatMapProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  assets: AssetRuntime[];
  /** Active critical anomalies per asset id, used in the tier calculation. */
  criticalByAsset: Record<string, number>;
  className?: string;
}

interface Row {
  category: string;
  counts: Record<RiskTier, number>;
  total: number;
  worst: number;
}

export const RiskHeatMap = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  assets,
  criticalByAsset,
  className,
}: RiskHeatMapProps) => {
  const { rows, max } = useMemo(() => {
    const map = new Map<string, Row>();

    for (const asset of assets) {
      const tier = asRiskTier(asset.riskTier);

      const existing =
        map.get(asset.category) ??
        ({
          category: asset.category,
          counts: { critical: 0, high: 0, medium: 0, low: 0, healthy: 0 },
          total: 0,
          worst: 0,
        } satisfies Row);

      existing.counts[tier] += 1;
      existing.total += 1;
      map.set(asset.category, existing);
    }

    const list = [...map.values()].map((row) => ({
      ...row,
      // Weight the worst tiers so the sort surfaces genuine exposure.
      worst: row.counts.critical * 4 + row.counts.high * 2 + row.counts.medium,
    }));

    return {
      rows: list.sort((a, b) => b.worst - a.worst),
      max: list.reduce(
        (peak, row) => Math.max(peak, ...RISK_TIERS.map((tier) => row.counts[tier.tier])),
        0,
      ),
    };
  }, [assets, criticalByAsset]);

  const cellFill = (count: number): string => densityRampColor(count, max);

  const columnTotals = RISK_TIERS.map((tier) => ({
    tier: tier.tier,
    label: tier.label,
    color: tier.color,
    count: rows.reduce((sum, row) => sum + row.counts[tier.tier], 0),
  }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      actions={actions}
      footnote={footnote}
      className={className}
    >
      <div className="scroll-x">
        <div className="min-w-[34rem]">
          {/* Column headers with the tier's reserved status colour as a marker. */}
          <div className="flex items-end gap-1.5 pb-2">
            <span className="w-40 shrink-0" />
            {columnTotals.map((column) => (
              <div key={column.tier} className="flex-1 text-center">
                <span
                  className="mx-auto mb-1.5 block h-0.5 w-6 rounded-full"
                  style={{ backgroundColor: column.color }}
                  aria-hidden
                />
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                  {column.label.replace(' risk', '')}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-fg-soft">
                  {column.count}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.category} className="flex items-center gap-1.5">
                <div className="flex w-40 shrink-0 items-baseline justify-between gap-2">
                  <span className="truncate text-[11.5px] font-medium text-fg-soft">{row.category}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-fg-faint">{row.total}</span>
                </div>

                {RISK_TIERS.map((tier) => {
                  const count = row.counts[tier.tier];
                  return (
                    <Tooltip
                      key={tier.tier}
                      content={
                        <span className="whitespace-nowrap">
                          {row.category} · {tier.label}: <strong className="text-fg">{count}</strong> device
                          {count === 1 ? '' : 's'}
                          {row.total > 0 ? ` (${formatPercent((count / row.total) * 100, 0)} of category)` : ''}
                        </span>
                      }
                    >
                      <span
                        className="flex h-8 flex-1 items-center justify-center rounded-[4px] text-[11px] font-semibold tabular-nums ring-1 ring-inset ring-overlay/[0.05] transition-transform duration-150 hover:scale-[1.06] hover:ring-overlay/25"
                        style={{
                          backgroundColor: cellFill(count),
                          // Ink is chosen from the fill's measured luminance rather
                          // than from the theme, so a pale cell gets dark text in
                          // either theme and a saturated one gets light text.
                          color:
                            count === 0
                              ? 'rgb(var(--fg-faint))'
                              : needsDarkInk(cellFill(count))
                                ? ON_FILL_INK
                                : '#FFFFFF',
                          minWidth: 34,
                        }}
                      >
                        {count > 0 ? count : '·'}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sequential ramp legend. */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="text-[10.5px] text-fg-faint">0</span>
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className="h-2.5 w-6 rounded-[2px]"
                  style={{ backgroundColor: densityRampColor(step + 1, 6) }}
                  aria-hidden
                />
              ))}
            </div>
            <span className="text-[10.5px] tabular-nums text-fg-faint">{formatNumber(max)} devices</span>
          </div>
        </div>
      </div>
    </ChartFrame>
  );
};
