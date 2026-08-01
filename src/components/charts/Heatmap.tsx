import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { densityRampColor, ORDINAL_BLUE } from '@/config/viz';
import { formatNumber } from '@/utils/format';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChartFrame } from './ChartFrame';

export interface HeatmapCell {
  row: string;
  col: number;
  value: number;
}

export interface HeatmapProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  cells: HeatmapCell[];
  rows: string[];
  cols: number[];
  colLabel: (col: number) => string;
  valueLabel: (value: number) => string;
  className?: string;
}

/**
 * Sequential single-hue density grid. Magnitude is carried by lightness, and
 * every cell exposes its exact value on hover so colour is never the only
 * channel.
 */
export const Heatmap = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  cells,
  rows,
  cols,
  colLabel,
  valueLabel,
  className,
}: HeatmapProps) => {
  const max = cells.reduce((peak, cell) => Math.max(peak, cell.value), 0);
  const lookup = new Map(cells.map((cell) => [`${cell.row}|${cell.col}`, cell.value]));

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
          <div className="flex flex-col gap-1">
            {rows.map((row) => (
              <div key={row} className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-fg-dim">{row}</span>
                <div className="flex flex-1 gap-1">
                  {cols.map((col) => {
                    const value = lookup.get(`${row}|${col}`) ?? 0;
                    return (
                      <Tooltip
                        key={`${row}-${col}`}
                        content={
                          <span className="whitespace-nowrap">
                            <strong className="font-semibold text-fg">{row}</strong> · {colLabel(col)} —{' '}
                            {valueLabel(value)}
                          </span>
                        }
                      >
                        <span
                          className="h-5 flex-1 rounded-[3px] ring-1 ring-inset ring-overlay/[0.04] transition-transform duration-150 hover:scale-[1.14] hover:ring-overlay/25"
                          style={{ backgroundColor: densityRampColor(value, max), minWidth: 12 }}
                          aria-label={`${row} ${colLabel(col)}: ${valueLabel(value)}`}
                        />
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="mt-1 flex items-center gap-1.5">
              <span className="w-8 shrink-0" />
              <div className="flex flex-1 gap-1">
                {cols.map((col) => (
                  <span
                    key={`axis-${col}`}
                    className="flex-1 text-center text-[9.5px] tabular-nums text-fg-faint"
                    style={{ minWidth: 12 }}
                  >
                    {col % 3 === 0 ? colLabel(col) : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="text-[10.5px] text-fg-faint">0</span>
            <div className="flex gap-0.5">
              {ORDINAL_BLUE.map((step) => (
                <span key={step} className="h-2.5 w-5 rounded-[2px]" style={{ backgroundColor: step }} aria-hidden />
              ))}
            </div>
            <span className="text-[10.5px] tabular-nums text-fg-faint">{formatNumber(max)}</span>
          </div>
        </div>
      </div>
    </ChartFrame>
  );
};
