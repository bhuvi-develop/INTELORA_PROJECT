import { cn } from '@/lib/cn';
import { APP } from '@/config/env';

export interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Adds the animated telemetry pulse used on the splash screen. */
  animated?: boolean;
}

/** INTELORA mark: an energy vertex over a sensing arc. */
export const LogoMark = ({ size = 32, className, animated = false }: LogoMarkProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    className={cn('shrink-0', className)}
    role="img"
    aria-label={`${APP.name} mark`}
  >
    <defs>
      <linearGradient id="intelora-mark-fill" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7FB4FF" />
        <stop offset="0.55" stopColor="#3D8EF0" />
        <stop offset="1" stopColor="#1C5CAB" />
      </linearGradient>
      <linearGradient id="intelora-mark-arc" x1="6" y1="24" x2="42" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3D8EF0" stopOpacity="0.15" />
        <stop offset="0.5" stopColor="#5C9FFF" stopOpacity="0.85" />
        <stop offset="1" stopColor="#3D8EF0" stopOpacity="0.15" />
      </linearGradient>
    </defs>

    <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#0B0F1A" stroke="rgba(255,255,255,0.09)" />

    {/* Sensing arcs — the MIKOS acquisition envelope */}
    <path
      d="M12 30c0-6.6 5.4-12 12-12s12 5.4 12 12"
      stroke="url(#intelora-mark-arc)"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={animated ? 'animate-pulse' : undefined}
    />
    <path
      d="M7 33c0-9.4 7.6-17 17-17s17 7.6 17 17"
      stroke="url(#intelora-mark-arc)"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.5"
    />

    {/* Energy vertex */}
    <path
      d="M24 9.5 32.5 24 24 20.2 15.5 24 24 9.5Z"
      fill="url(#intelora-mark-fill)"
    />
    <path d="M24 22.6 31 38.5H17L24 22.6Z" fill="url(#intelora-mark-fill)" fillOpacity="0.72" />
    <circle cx="24" cy="24" r="2.4" fill="#0B0F1A" />
    <circle cx="24" cy="24" r="1.3" fill="#7FB4FF" />
  </svg>
);

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  animated?: boolean;
}

const MARK_SIZE = { sm: 26, md: 32, lg: 44 } as const;
const WORD_SIZE = {
  sm: 'text-[15px] tracking-[0.2em]',
  md: 'text-[18px] tracking-[0.22em]',
  lg: 'text-[26px] tracking-[0.26em]',
} as const;

export const Logo = ({ size = 'md', showTagline = false, className, animated = false }: LogoProps) => (
  <div className={cn('flex items-center gap-2.5', className)}>
    <LogoMark size={MARK_SIZE[size]} animated={animated} />
    <div className="min-w-0">
      <p className={cn('font-semibold leading-none text-fg', WORD_SIZE[size])}>{APP.name}</p>
      {showTagline ? (
        <p
          className={cn(
            'mt-1.5 font-medium uppercase leading-none text-fg-dim',
            size === 'lg' ? 'text-[10.5px] tracking-[0.3em]' : 'text-[9px] tracking-[0.24em]',
          )}
        >
          {APP.tagline}
        </p>
      ) : null}
    </div>
  </div>
);
