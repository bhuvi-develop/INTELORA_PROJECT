import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { deviceDetailPath } from '@/routes/paths';

export interface DeviceIdentityProps {
  assetId: string;
  assetName: string;
  /** Secondary line — typically brand and model, or the category. */
  meta?: string;
  linked?: boolean;
  className?: string;
}

/** Two-line device identity cell, used by every table and ranking list. */
export const DeviceIdentity = ({ assetId, assetName, meta, linked = true, className }: DeviceIdentityProps) => {
  const body = (
    <>
      <span className="block truncate text-[12.5px] font-semibold text-fg">{assetName}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-muted">
          {assetId}
        </span>
        {meta ? <span className="truncate text-[10.5px] text-fg-dim">{meta}</span> : null}
      </span>
    </>
  );

  if (!linked) return <div className={cn('min-w-0', className)}>{body}</div>;

  return (
    <Link
      to={deviceDetailPath(assetId)}
      onClick={(event) => event.stopPropagation()}
      className={cn('group block min-w-0 transition-colors hover:text-brand-200', className)}
    >
      {body}
    </Link>
  );
};
