import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { SURFACE } from '@/config/viz';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import type { SeriesDef } from './chartTheme';

/* ───────────────────────────────────────────────────────────────────────────
 * Radar profile.
 *
 * The one form the chart library was missing, and the right one for a scored
 * profile: several axes that share a scale and are read as a shape rather than
 * as individual magnitudes. Criticality is exactly that — safety, production
 * impact, replacement cost, lead time and redundancy, each scored 0–100, where
 * the useful question is which direction the shape leans.
 *
 * Deliberately capped at two series. A radar with four overlapping polygons is
 * unreadable, and the moment a comparison needs more than two members it wants
 * small multiples or a grouped bar instead.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface RadarAxis {
  /** Axis label, shown around the perimeter. */
  axis: string;
  [seriesKey: string]: string | number;
}

export interface RadarProfileProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  data: RadarAxis[];
  /** One or two series. Colour comes from the caller's palette. */
  series: ReadonlyArray<SeriesDef>;
  height?: number;
  /** Upper bound of the shared scale. Scores are 0–100 by default. */
  max?: number;
  className?: string;
}

export const RadarProfile = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  data,
  series,
  height = 300,
  max = 100,
  className,
}: RadarProfileProps) => (
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
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={SURFACE.gridline} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: SURFACE.inkSecondary, fontSize: 11 }}
            stroke={SURFACE.baseline}
          />
          <PolarRadiusAxis
            domain={[0, max]}
            tick={{ fill: SURFACE.inkMuted, fontSize: 10 }}
            stroke={SURFACE.gridline}
            axisLine={false}
tickCount={5}
          />
          <Tooltip content={<ChartTooltip series={series} />} isAnimationActive={false} />
          {series.slice(0, 2).map((entry) => (
            <Radar
              key={entry.key}
              name={entry.name}
              dataKey={entry.key}
              stroke={entry.color}
              fill={entry.color}
              fillOpacity={0.22}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  </ChartFrame>
);
