import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { AssetRuntime, HealthBand } from '@/engine/types';
import { BANDS, bandDef } from '@/engine/derive';
import { ON_FILL_INK, needsDarkInk } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { deviceDetailPath } from '@/routes/paths';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChartFrame } from './ChartFrame';

/* ───────────────────────────────────────────────────────────────────────────
 * Asset status matrix.
 *
 * One cell per device, coloured by condition band, grouped by category. Every
 * cell exposes its exact figures on hover and links straight to the device, so
 * an executive can go from "something is red" to the device in one move.
 *
 * Above `AGGREGATE_ABOVE` devices the matrix switches to density cells — a
 * count per category and band — because ten thousand individual tiles is a
 * texture, not information. That threshold is what lets the same component
 * serve a ten-device pilot and a full estate without a redesign.
 * ─────────────────────────────────────────────────────────────────────────── */

const AGGREGATE_ABOVE = 240;

export interface AssetStatusMatrixProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  assets: AssetRuntime[];
  className?: string;
  /** Highlight cells in this band; others dim. */
  focusBand?: HealthBand | 'all';
}

interface CategoryGroup {
  category: string;
  assets: AssetRuntime[];
  counts: Record<HealthBand, number>;
  meanHealth: number;
}

export const AssetStatusMatrix = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  assets,
  className,
  focusBand = 'all',
}: AssetStatusMatrixProps) => {
  const aggregated = assets.length > AGGREGATE_ABOVE;

  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, AssetRuntime[]>();
    for (const asset of assets) {
      const list = map.get(asset.category) ?? [];
      list.push(asset);
      map.set(asset.category, list);
    }

    return [...map.entries()]
      .map(([category, rows]) => {
        const counts = BANDS.reduce<Record<HealthBand, number>>(
          (acc, band) => ({ ...acc, [band.band]: rows.filter((row) => row.band === band.band).length }),
          { healthy: 0, good: 0, warning: 0, critical: 0 },
        );
        return {
          category,
          // Weakest first within a category, so problems sit at the left edge.
          assets: [...rows].sort((a, b) => a.health - b.health),
          counts,
          meanHealth: rows.reduce((sum, row) => sum + row.health, 0) / Math.max(1, rows.length),
        };
      })
      .sort((a, b) => a.meanHealth - b.meanHealth);
  }, [assets]);

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
      {/* Band legend — colour is never the only channel, the count is stated. */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {BANDS.map((band) => {
          const count = assets.filter((asset) => asset.band === band.band).length;
          return (
            <li key={band.band} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: band.color }}
                aria-hidden
              />
              <span className="text-[11.5px] text-fg-muted">{band.label}</span>
              <span className="text-[11.5px] font-semibold tabular-nums text-fg">{count}</span>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex w-full shrink-0 items-baseline justify-between gap-2 sm:w-44">
              <span className="truncate text-[11.5px] font-medium text-fg-soft">{group.category}</span>
              <span className="shrink-0 text-[10.5px] tabular-nums text-fg-faint">
                {formatNumber(group.meanHealth, 1)}
              </span>
            </div>

            {aggregated ? (
              /* Density row — one cell per band, width proportional to count. */
              <div className="flex h-6 min-w-0 flex-1 items-stretch gap-0.5 overflow-hidden rounded-md">
                {BANDS.map((band) => {
                  const count = group.counts[band.band];
                  if (count === 0) return null;
                  const share = (count / group.assets.length) * 100;
                  return (
                    <Tooltip
                      key={band.band}
                      content={
                        <span className="whitespace-nowrap">
                          {group.category} · {band.label}: <strong className="text-fg">{count}</strong> device
                          {count === 1 ? '' : 's'} ({formatPercent(share, 0)})
                        </span>
                      }
                    >
                      <span
                        className="flex h-6 items-center justify-center text-[10px] font-semibold tabular-nums"
                        style={{
                          backgroundColor: band.color,
                          // Chosen from the band fill's luminance, not the theme.
                          color: needsDarkInk(band.color) ? ON_FILL_INK : '#FFFFFF',
                          width: `${share}%`,
                          minWidth: 22,
                        }}
                      >
                        {count}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>
            ) : (
              /* One cell per device. */
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {group.assets.map((asset) => {
                  const def = bandDef(asset.band);
                  const dimmed = focusBand !== 'all' && asset.band !== focusBand;
                  return (
                    <Tooltip
                      key={asset.device.assetId}
                      content={
                        <span className="block whitespace-nowrap">
                          <strong className="text-fg">{asset.device.assetName}</strong>
                          <br />
                          {asset.device.assetId} · {def.label}
                          <br />
                          Health {formatNumber(asset.health, 1)}% · {formatNumber(asset.live.power, 1)} W ·{' '}
                          {formatNumber(asset.live.temperature, 1)} °C
                          <br />
                          {asset.device.status} · RUL{' '}
                          {formatNumber(asset.prediction.primary.rulDays, 0)} d
                        </span>
                      }
                    >
                      <Link
                        to={deviceDetailPath(asset.device.assetId)}
                        aria-label={`${asset.device.assetName}, ${def.label}, health ${formatNumber(asset.health, 1)}`}
                        className={cn(
                          'block h-6 w-6 rounded-[4px] ring-1 ring-inset ring-overlay/[0.06] transition-all duration-150',
                          'hover:scale-[1.18] hover:ring-overlay/40 focus-visible:scale-[1.18]',
                          dimmed && 'opacity-25',
                        )}
                        style={{ backgroundColor: def.color }}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {aggregated ? (
        <p className="mt-4 border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
          Showing density cells because the estate exceeds {formatNumber(AGGREGATE_ABOVE)} devices. Each cell reports the
          device count for that category and band; hover for the share.
        </p>
      ) : null}
    </ChartFrame>
  );
};
