import { SERIES, SURFACE } from '@/config/viz';
import { cn } from '@/lib/cn';
import { clamp, formatNumber } from '@/utils/format';

export interface RadialGaugeProps {
  value: number;
  max?: number;
  /** Arc colour. Pass a status token for condition, brand for neutral metrics. */
  color?: string;
  /** Reference mark on the arc (target / world-class). */
  target?: number;
  size?: number;
  thickness?: number;
  label: string;
  caption?: string;
  unit?: string;
  decimals?: number;
  className?: string;
}

/**
 * Single-value arc. The number is the hero — the arc only encodes progress
 * toward the ceiling, so it never carries meaning the label does not repeat.
 */
export const RadialGauge = ({
  value,
  max = 100,
  color = SERIES[0],
  target,
  size = 148,
  thickness = 10,
  label,
  caption,
  unit,
  decimals = 1,
  className,
}: RadialGaugeProps) => {
  const pct = clamp(value / max, 0, 1);
  const radius = (size - thickness) / 2;
  const circumference = Math.PI * radius * 1.5; // 270° sweep
  const center = size / 2;

  const arcPath = (fraction: number): string => {
    const startAngle = 135;
    const sweep = 270 * fraction;
    const endAngle = startAngle + sweep;
    const toXY = (angle: number) => {
      const rad = (angle * Math.PI) / 180;
      return [center + radius * Math.cos(rad), center + radius * Math.sin(rad)];
    };
    const [x1, y1] = toXY(startAngle);
    const [x2, y2] = toXY(endAngle);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const targetAngle = target === undefined ? null : 135 + 270 * clamp(target / max, 0, 1);
  const targetPoint = (() => {
    if (targetAngle === null) return null;
    const rad = (targetAngle * Math.PI) / 180;
    const inner = radius - thickness / 2 - 1;
    const outer = radius + thickness / 2 + 1;
    return {
      x1: center + inner * Math.cos(rad),
      y1: center + inner * Math.sin(rad),
      x2: center + outer * Math.cos(rad),
      y2: center + outer * Math.sin(rad),
    };
  })();

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size * 0.82 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute left-0 top-0" role="img" aria-label={`${label}: ${formatNumber(value, decimals)}${unit ?? ''}`}>
          <path
            d={arcPath(1)}
            fill="none"
            stroke={SURFACE.track}
            strokeWidth={thickness}
            strokeLinecap="round"
          />
          <path
            d={arcPath(pct)}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)',
            }}
          />
          {targetPoint ? (
            <line
              x1={targetPoint.x1}
              y1={targetPoint.y1}
              x2={targetPoint.x2}
              y2={targetPoint.y2}
              stroke={SURFACE.marker}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
        </svg>

        <div className="absolute inset-x-0 top-[38%] flex -translate-y-1/2 flex-col items-center">
          <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-fg">
            {formatNumber(value, decimals)}
            {unit ? <span className="ml-0.5 text-base font-medium text-fg-muted">{unit}</span> : null}
          </span>
          {target !== undefined ? (
            <span className="mt-1.5 text-[10.5px] tabular-nums text-fg-faint">
              target {formatNumber(target, 0)}
              {unit ?? ''}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-1 text-center text-[12px] font-medium text-fg-soft">{label}</p>
      {caption ? <p className="mt-0.5 text-center text-[11px] leading-relaxed text-fg-dim">{caption}</p> : null}
    </div>
  );
};
