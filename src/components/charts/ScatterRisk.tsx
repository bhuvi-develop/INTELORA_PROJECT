import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { SERIES_ALLPAIRS, SURFACE } from '@/config/viz';
import { ChartFrame } from './ChartFrame';
import { axisDefaults, cursorDefaults, gridDefaults, type SeriesDef } from './chartTheme';

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  z?: number;
  group: string;
  meta?: string;
}

export interface ScatterRiskProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  height?: number;
  /** Quadrant split lines, in data units. */
  quadrant?: { x: number; y: number };
  quadrantLabels?: [string, string, string, string];
  className?: string;
  onSelect?: (point: ScatterPoint) => void;
}

interface QuadrantTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ScatterPoint }>;
  xLabel?: string;
  yLabel?: string;
}

const QuadrantTooltip = ({ active, payload, xLabel, yLabel }: QuadrantTooltipProps) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="min-w-[11rem] rounded-xl border border-overlay/10 bg-ink-750/97 px-3 py-2.5 shadow-raised backdrop-blur-xl">
      <p className="text-[12px] font-semibold text-fg">{point.label}</p>
      {point.meta ? <p className="mt-0.5 text-[11px] text-fg-dim">{point.meta}</p> : null}
      <dl className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[11px] text-fg-muted">{xLabel}</dt>
          <dd className="text-[12px] font-semibold tabular-nums text-fg">{point.x}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[11px] text-fg-muted">{yLabel}</dt>
          <dd className="text-[12px] font-semibold tabular-nums text-fg">{point.y}</dd>
        </div>
      </dl>
    </div>
  );
};

/**
 * All-pairs comparison form, so the series count is capped at three slots —
 * the validated all-pairs subset of the categorical palette.
 */
export const ScatterRisk = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  points,
  xLabel,
  yLabel,
  height = 320,
  quadrant,
  quadrantLabels,
  className,
  onSelect,
}: ScatterRiskProps) => {
  const groups = Array.from(new Set(points.map((point) => point.group))).slice(0, SERIES_ALLPAIRS.length);
  const series: SeriesDef[] = groups.map((group, index) => ({
    key: group,
    name: group,
    color: SERIES_ALLPAIRS[index],
  }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      actions={actions}
      series={series}
      footnote={footnote}
      className={className}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 22, left: -8 }}>
            <CartesianGrid {...gridDefaults} vertical />

            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              {...axisDefaults}
              label={{
                value: xLabel,
                position: 'insideBottom',
                offset: -14,
                fill: SURFACE.inkMuted,
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              {...axisDefaults}
              width={46}
              label={{
                value: yLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 18,
                fill: SURFACE.inkMuted,
                fontSize: 11,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[64, 320]} />

            {quadrant ? (
              <>
                <ReferenceArea
                  x1={quadrant.x}
                  x2={100}
                  y1={quadrant.y}
                  y2={100}
                  fill="#D03B3B"
                  fillOpacity={0.07}
                  stroke="rgba(208,59,59,0.28)"
                  strokeDasharray="3 5"
                  label={
                    quadrantLabels
                      ? { value: quadrantLabels[0], position: 'insideTopRight', fill: SURFACE.inkMuted, fontSize: 10.5 }
                      : undefined
                  }
                />
                <ReferenceArea
                  x1={0}
                  x2={quadrant.x}
                  y1={quadrant.y}
                  y2={100}
                  fill="#FAB219"
                  fillOpacity={0.045}
                  label={
                    quadrantLabels
                      ? { value: quadrantLabels[1], position: 'insideTopLeft', fill: SURFACE.inkMuted, fontSize: 10.5 }
                      : undefined
                  }
                />
                <ReferenceArea
                  x1={quadrant.x}
                  x2={100}
                  y1={0}
                  y2={quadrant.y}
                  fill="#FAB219"
                  fillOpacity={0.045}
                  label={
                    quadrantLabels
                      ? { value: quadrantLabels[2], position: 'insideBottomRight', fill: SURFACE.inkMuted, fontSize: 10.5 }
                      : undefined
                  }
                />
                <ReferenceArea
                  x1={0}
                  x2={quadrant.x}
                  y1={0}
                  y2={quadrant.y}
                  fill="#0CA30C"
                  fillOpacity={0.05}
                  label={
                    quadrantLabels
                      ? { value: quadrantLabels[3], position: 'insideBottomLeft', fill: SURFACE.inkMuted, fontSize: 10.5 }
                      : undefined
                  }
                />
              </>
            ) : null}

            <Tooltip
              cursor={cursorDefaults}
              content={<QuadrantTooltip xLabel={xLabel} yLabel={yLabel} />}
              isAnimationActive={false}
            />

            {groups.map((group, index) => (
              <Scatter
                key={group}
                name={group}
                data={points.filter((point) => point.group === group)}
                fill={SERIES_ALLPAIRS[index]}
                fillOpacity={0.82}
                stroke={SURFACE.chart}
                strokeWidth={2}
                isAnimationActive={false}
                onClick={(payload: unknown) => {
                  const point = (payload as { payload?: ScatterPoint } | undefined)?.payload;
                  if (point && onSelect) onSelect(point);
                }}
                className={onSelect ? 'cursor-pointer' : undefined}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
