import { cn } from '@/lib/cn';
import { APP } from '@/config/env';

/* ───────────────────────────────────────────────────────────────────────────
 * INTELORA identity.
 *
 * The mark is an isometric prism with a lit aperture through its top face —
 * three planes of a solid object, correctly shaded for a single light source,
 * with the platform's intelligence reading out through the opening.
 *
 * Isometric rather than flat because the product monitors physical hardware:
 * the mark should look like an object, not a pictogram. The geometry is exact —
 * every vertex is a face centre plus one of four offsets — so the solid reads
 * as a real form at 22px in the sidebar and at 200px on the opening screen.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Lights the aperture with a slow breathing pulse. */
  animated?: boolean;
  /** Distinguishes the gradient ids when several marks share a document. */
  idSuffix?: string;
}

export const LogoMark = ({ size = 32, className, animated = false, idSuffix = '' }: LogoMarkProps) => {
  const id = (name: string) => `intelora-${name}${idSuffix}`;

  return (
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
        {/* Top plane catches the light. */}
        <linearGradient id={id('top')} x1="9" y1="6" x2="39" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8FC0FF" />
          <stop offset="0.5" stopColor="#5C9FFF" />
          <stop offset="1" stopColor="#3D8EF0" />
        </linearGradient>
        {/* Left plane turns away from it. */}
        <linearGradient id={id('left')} x1="9" y1="14.5" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3D8EF0" />
          <stop offset="1" stopColor="#1C5CAB" />
        </linearGradient>
        {/* Right plane is furthest from it. */}
        <linearGradient id={id('right')} x1="39" y1="14.5" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#245C9E" />
          <stop offset="1" stopColor="#12325B" />
        </linearGradient>
        <radialGradient id={id('core')} cx="24" cy="14.5" r="7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAF3FF" />
          <stop offset="0.55" stopColor="#9CC8FF" />
          <stop offset="1" stopColor="#5C9FFF" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {/* Three planes of one solid: top, left, right. */}
      <path d="M24 6 39 14.5 24 23 9 14.5Z" fill={`url(#${id('top')})`} />
      <path d="M9 14.5 24 23v17L9 31.5Z" fill={`url(#${id('left')})`} />
      <path d="M39 14.5 24 23v17l15-8.5Z" fill={`url(#${id('right')})`} />

      {/* Lit aperture — the intelligence reading out of the solid. */}
      <path d="M24 11.1 30 14.5 24 17.9 18 14.5Z" fill={`url(#${id('core')})`}>
        {animated ? (
          <animate attributeName="opacity" values="0.72;1;0.72" dur="3.2s" repeatCount="indefinite" />
        ) : null}
      </path>

      {/* Upper edges take the specular highlight. */}
      <path
        d="M24 6 39 14.5M24 6 9 14.5"
        stroke="#BEDCFF"
        strokeOpacity="0.55"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      {/* The vertical seam where the two side planes meet. */}
      <path d="M24 23v17" stroke="#0B0F1A" strokeOpacity="0.4" strokeWidth="0.9" />
    </svg>
  );
};

/* ─── Dimensional variant, for the opening sequence ──────────────────────── */

export interface LogoMark3DProps {
  size?: number;
  className?: string;
  /** Depth layers behind the face plate. More layers read as more extrusion. */
  depth?: number;
}

/**
 * The same solid, given real depth.
 *
 * Stacked copies of the mark are pushed back along the Z axis inside a
 * perspective container, so the form has genuine parallax rather than a painted
 * shadow — it separates as the scene rotates. Kept to the opening screen: at
 * sidebar scale the flat mark is sharper and cheaper.
 */
export const LogoMark3D = ({ size = 168, className, depth = 7 }: LogoMark3DProps) => (
  <div
    className={cn('relative', className)}
    style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
    aria-hidden
  >
    {Array.from({ length: depth }, (_, index) => {
      const layer = depth - index - 1;
      return (
        <div
          key={layer}
          className="absolute inset-0"
          style={{
            transform: `translateZ(${-layer * (size * 0.035)}px) scale(${1 - layer * 0.012})`,
            opacity: layer === 0 ? 1 : 0.5 - layer * 0.055,
            filter: layer === 0 ? 'none' : `blur(${layer * 0.6}px)`,
          }}
        >
          <LogoMark size={size} animated={layer === 0} idSuffix={`-d${layer}`} />
        </div>
      );
    })}
  </div>
);

/* ─── Wordmark ───────────────────────────────────────────────────────────── */

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  animated?: boolean;
}

const MARK_SIZE = { sm: 24, md: 30, lg: 42 } as const;
const WORD_SIZE = {
  sm: 'text-[14px] tracking-[0.24em]',
  md: 'text-[17px] tracking-[0.26em]',
  lg: 'text-[25px] tracking-[0.3em]',
} as const;

export const Logo = ({ size = 'md', showTagline = false, className, animated = false }: LogoProps) => (
  <div className={cn('flex items-center gap-2.5', className)}>
    <LogoMark size={MARK_SIZE[size]} animated={animated} />
    <div className="min-w-0">
      <p className={cn('font-semibold leading-none text-fg', WORD_SIZE[size])}>{APP.name}</p>
      {showTagline ? (
        <p
          className={cn(
            'mt-1.5 font-medium uppercase leading-none text-fg-faint',
            size === 'lg' ? 'text-[10px] tracking-[0.32em]' : 'text-[8.5px] tracking-[0.26em]',
          )}
        >
          {APP.tagline}
        </p>
      ) : null}
    </div>
  </div>
);

export const SidebarLogo = ({ collapsed = false }: { collapsed?: boolean }) => {
  if (collapsed) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 border border-brand-500/20 shadow-[0_0_15px_rgba(0,110,230,0.3)]">
        <span 
          className="text-lg font-black bg-gradient-to-b from-white via-brand-300 to-brand-600 bg-clip-text text-transparent"
          style={{
            textShadow: '0 1px 1px rgba(0,0,0,0.5), 0px 2px 4px rgba(0,110,230,0.4)'
          }}
        >
          I
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-5 py-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md shadow-panel">
      <span
        className="text-lg font-black tracking-[0.22em] bg-gradient-to-b from-white via-[#cde3ff] to-[#005ac8] bg-clip-text text-transparent uppercase"
        style={{
          textShadow: '0px 1px 1px rgba(255,255,255,0.6), 0px 2px 0px #004499, 0px 3px 0px #002255, 0px 8px 16px rgba(0,110,230,0.5)',
          paddingLeft: '0.22em'
        }}
      >
        INTELORA
      </span>
    </div>
  );
};
