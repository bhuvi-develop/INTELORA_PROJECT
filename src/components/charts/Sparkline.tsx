import { useId } from 'react';
import { SERIES, SURFACE } from '@/config/viz';
import { cn } from '@/lib/cn';

export interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
  /** Fill the area under the line. */
  filled?: boolean;
  /** Mark the final value with a dot. */
  endDot?: boolean;
  strokeWidth?: number;
}

/**
 * Bare trail mark — no axes, no tooltip. Used inside stat tiles where the
 * headline number carries the value and the trail carries only direction.
 */
export const Sparkline = ({
  data,
  color = SERIES[0],
  height = 40,
  className,
  filled = true,
  endDot = true,
  strokeWidth = 2,
}: SparklineProps) => {
  const gradientId = useId().replace(/:/g, '');

  if (data.length < 2) return <div className={cn('w-full', className)} style={{ height }} aria-hidden />;

  const width = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth;
  const usable = height - pad * 2;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = pad + (1 - (value - min) / span) * usable;
    return { x, y };
  });

  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const tail = points[points.length - 1];

  return (
    <svg
      className={cn('w-full overflow-visible', className)}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden
    >
      {filled ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {endDot ? (
        <circle
          cx={tail.x}
          cy={tail.y}
          r={2.4}
          fill={color}
          stroke={SURFACE.chart}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
};
