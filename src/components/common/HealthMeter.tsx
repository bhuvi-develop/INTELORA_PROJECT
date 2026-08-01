import type { HealthBand } from '@/engine/types';
import { bandDef, bandOf } from '@/engine/derive';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Progress } from '@/components/ui/Progress';

export interface HealthMeterProps {
  health: number;
  /** Show the numeric score beside the bar. */
  showValue?: boolean;
  /** Show the band word so colour is never the only channel. */
  showBand?: boolean;
  width?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * Health score bar. The bar is coloured by band and the number and band word
 * carry the meaning, so the reading survives a monochrome print or a
 * colour-vision deficiency.
 */
export const HealthMeter = ({
  health,
  showValue = true,
  showBand = false,
  width = 'w-24',
  size = 'sm',
  className,
}: HealthMeterProps) => {
  const band: HealthBand = bandOf(health);
  const def = bandDef(band);

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Progress
        value={health}
        size={size}
        color={def.color}
        marker={95}
        label={`Health score ${formatNumber(health, 1)} — ${def.label}`}
        className={width}
      />
      {showValue ? (
        <span className="w-10 shrink-0 text-[12px] font-semibold tabular-nums text-fg">
          {formatNumber(health, 1)}
        </span>
      ) : null}
      {showBand ? <span className={cn('shrink-0 text-[11px] font-medium', def.text)}>{def.label}</span> : null}
    </div>
  );
};

/** Compact numeric health readout with band colouring, for dense table cells. */
export const HealthValue = ({
  health,
  className,
  showUnit = true,
}: {
  health: number;
  className?: string;
  showUnit?: boolean;
}) => {
  const def = bandDef(bandOf(health));
  return (
    <span className={cn('font-semibold tabular-nums', def.text, className)}>
      {formatNumber(health, 1)}
      {showUnit ? <span className="ml-0.5 text-[0.85em] font-normal opacity-70">%</span> : null}
    </span>
  );
};
