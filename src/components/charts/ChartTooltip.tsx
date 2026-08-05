import { SERIES } from '@/config/viz';
import { formatNumber } from '@/utils/format';
import type { SeriesDef } from './chartTheme';

export interface TooltipPayloadItem {
  name?: string | number;
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  series?: ReadonlyArray<SeriesDef>;
  /** Override the heading; defaults to the category/axis label. */
  labelFormatter?: (label: string | number | undefined, payload?: Record<string, unknown>) => string;
  /** Suppress entries whose value is not a finite number (forecast gaps). */
  hideEmpty?: boolean;
}

const formatValue = (value: number | string | undefined, def?: SeriesDef): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';
  const decimals = def?.decimals ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 1 : 2);
  const formatted = formatNumber(value, decimals);
  return def?.unit ? `${formatted} ${def.unit}` : formatted;
};

/** Shared crosshair tooltip. Values wear text tokens; the swatch carries identity. */
export const ChartTooltip = ({
  active,
  payload,
  label,
  series,
  labelFormatter,
  hideEmpty = true,
}: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload.filter((item) => {
    if (!hideEmpty) return true;
    return typeof item.value !== 'number' || Number.isFinite(item.value);
  });

  if (rows.length === 0) return null;

  const heading = labelFormatter ? labelFormatter(label, payload[0]?.payload) : String(label ?? '');

  return (
    <div className="min-w-[10rem] rounded-xl border border-overlay/10 bg-ink-750/97 px-3 py-2.5 shadow-raised backdrop-blur-xl">
      {heading ? (
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-fg-faint">{heading}</p>
      ) : null}
      <ul className="space-y-1.5">
        {rows.map((item, index) => {
          const itemKey = String(item.dataKey ?? item.payload?.key ?? '');
          const itemName = String(item.name ?? item.payload?.name ?? '');
          const def = series?.find(
            (entry) =>
              (itemKey && entry.key === itemKey) ||
              (itemName && entry.name === itemName) ||
              (itemName && entry.key === itemName),
          );
          const color =
            (item.payload?.color as string | undefined) ??
            (item.payload?.fill as string | undefined) ??
            def?.color ??
            item.color ??
            SERIES[0];
          const displayName = def?.name ?? (itemName || String(item.dataKey ?? ''));

          return (
            <li key={`${itemKey}-${itemName}-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="truncate text-[11.5px] text-fg-muted">{displayName}</span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-fg">
                {formatValue(item.value, def)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
