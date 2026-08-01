import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
  /** Rounded pill shape for text lines. */
  rounded?: boolean;
  style?: CSSProperties;
}

export const Skeleton = ({ className, rounded = true, style }: SkeletonProps) => (
  <div
    aria-hidden
    style={style}
    className={cn(
      'relative overflow-hidden bg-overlay/[0.045]',
      rounded ? 'rounded-md' : 'rounded-none',
      className,
    )}
  >
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-overlay/[0.06] to-transparent" />
  </div>
);

export const SkeletonText = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div className={cn('space-y-2', className)}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
    ))}
  </div>
);

export const SkeletonCard = ({ className }: { className?: string }) => (
  <div className={cn('panel p-4 sm:p-5', className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="w-full space-y-2.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-2.5 w-40" />
      </div>
      <Skeleton className="h-9 w-9 rounded-lg" />
    </div>
    <Skeleton className="mt-5 h-12 w-full" />
  </div>
);

export const SkeletonChart = ({ className, height = 260 }: { className?: string; height?: number }) => (
  <div className={cn('panel p-4 sm:p-5', className)}>
    <div className="space-y-2.5">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="h-4 w-52" />
    </div>
    <Skeleton className="mt-5 w-full" style={{ height }} />
  </div>
);

export const SkeletonRows = ({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="divide-y divide-overlay/[0.05]">
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="flex items-center gap-4 px-4 py-3.5">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-40' : 'flex-1')} />
        ))}
      </div>
    ))}
  </div>
);
