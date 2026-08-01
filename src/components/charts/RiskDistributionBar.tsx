import { useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { RISK_TIERS, asRiskTier, type RiskTier } from '@/engine/derive';
import { ON_FILL_INK, needsDarkInk } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChartFrame } from './ChartFrame';

/* ───────────────────────────────────────────────────────────────────────────
 * Operational risk distribution.
 *
 * A single stacked composition bar for the estate, then one per category so the
 * concentration is visible rather than averaged away. Segments carry a 2px
 * surface gap so adjacent fills stay separable, and every segment states its
 * count — the width is the comparison, the number is the fact.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface RiskDistributionBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  assets: AssetRuntime[];
  criticalByAsset: Record<string, number>;
  className?: string;
  /** Render the per-category breakdown under the fleet bar. */
  showCategories?: boolean;
}

type Counts = Record<RiskTier, number>;

const emptyCounts = (): Counts => ({ critical: 0, high: 0, medium: 0, low: 0, healthy: 0 });

const StackedBar = ({ counts, total }: { counts: Counts; total: number }) => (
  <div className="flex h-7 w-full items-stretch gap-0.5 overflow-hidden rounded-lg bg-overlay/[0.04]">
    {RISK_TIERS.map((tier) => {
      const count = counts[tier.tier];
      if (count === 0) return null;
      const share = (count / Math.max(1, total)) * 100;
      return (
        <Tooltip
          key={tier.tier}
          content={
            <span className="whitespace-nowrap">
              {tier.label}: <strong className="text-fg">{count}</strong> device{count === 1 ? '' : 's'} (
              {formatPercent(share, 1)})
            </span>
          }
        >
          <span
            className="flex h-7 items-center justify-center text-[10.5px] font-bold tabular-nums transition-opacity hover:opacity-85"
            style={{
              backgroundColor: tier.color,
              // Chosen from the tier fill's luminance, not the theme.
              color: needsDarkInk(tier.color) ? ON_FILL_INK : '#FFFFFF',
              width: `${share}%`,
              minWidth: count > 0 ? 26 : 0,
            }}
          >
            {share >= 6 ? count : ''}
          </span>
        </Tooltip>
      );
    })}
  </div>
);

export const RiskDistributionBar = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  assets,
  criticalByAsset,
  className,
  showCategories = true,
}: RiskDistributionBarProps) => {
  const { fleet, categories, total } = useMemo(() => {
    const fleetCounts = emptyCounts();
    const byCategory = new Map<string, Counts>();

    for (const asset of assets) {
      const tier = asRiskTier(asset.riskTier);

      fleetCounts[tier] += 1;
      const existing = byCategory.get(asset.category) ?? emptyCounts();
      existing[tier] += 1;
      byCategory.set(asset.category, existing);
    }

    const list = [...byCategory.entries()]
      .map(([category, counts]) => ({
        category,
        counts,
        total: RISK_TIERS.reduce((sum, tier) => sum + counts[tier.tier], 0),
        exposure: counts.critical * 4 + counts.high * 2 + counts.medium,
      }))
      .sort((a, b) => b.exposure - a.exposure);

    return { fleet: fleetCounts, categories: list, total: assets.length };
  }, [assets, criticalByAsset]);

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
      {/* Tier legend with counts. */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {RISK_TIERS.map((tier) => (
          <li key={tier.tier} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: tier.color }}
              aria-hidden
            />
            <span className="text-[11.5px] text-fg-muted">{tier.label}</span>
            <span className={cn('text-[11.5px] font-semibold tabular-nums', tier.text)}>{fleet[tier.tier]}</span>
          </li>
        ))}
      </ul>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] font-semibold text-fg">Whole estate</span>
          <span className="text-[10.5px] tabular-nums text-fg-faint">{formatNumber(total)} devices</span>
        </div>
        <StackedBar counts={fleet} total={total} />
      </div>

      {showCategories ? (
        <div className="mt-4 space-y-2.5 border-t border-overlay/[0.06] pt-4">
          {categories.map((row) => (
            <div key={row.category}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-[11px] text-fg-muted">{row.category}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-fg-faint">
                  {row.counts.critical + row.counts.high > 0
                    ? `${row.counts.critical + row.counts.high} at risk of ${row.total}`
                    : `${row.total} devices`}
                </span>
              </div>
              <StackedBar counts={row.counts} total={row.total} />
            </div>
          ))}
        </div>
      ) : null}
    </ChartFrame>
  );
};
