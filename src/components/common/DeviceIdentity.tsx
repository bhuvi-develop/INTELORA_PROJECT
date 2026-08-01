import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { deviceDetailPath } from '@/routes/paths';

export interface DeviceIdentityProps {
  assetId: string;
  assetName: string;
  /** Secondary line — typically brand and model, or the category. */
  meta?: string;
  /**
   * Render the asset id as the primary element and drop the product name.
   *
   * Opt-in rather than the default because the estate's other modules identify a
   * device by what it is — a register, a maintenance queue and a telemetry view
   * all read better with "Dell Precision 3580" on the first line. The anomaly
   * module is the exception: its tables are scanned by asset id, the product
   * name is the same across dozens of rows, and the extra line costs vertical
   * space in views that are already dense.
   */
  idOnly?: boolean;
  linked?: boolean;
  className?: string;
}

/** Two-line device identity cell, used by every table and ranking list. */
export const DeviceIdentity = ({
  assetId,
  assetName,
  meta,
  idOnly = false,
  linked = true,
  className,
}: DeviceIdentityProps) => {
  const body = idOnly ? (
    // One line: the id carries the identity, the tag says what class of thing it
    // is. `assetName` is deliberately still required by the props so the linked
    // wrapper can label itself for assistive tech without showing the name.
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded-md bg-overlay/[0.06] px-2 py-0.5 font-mono text-[11.5px] font-semibold leading-tight text-fg-soft ring-1 ring-inset ring-overlay/[0.09]">
        {assetId}
      </span>
      {meta ? <span className="truncate text-[11px] text-fg-dim">{meta}</span> : null}
    </span>
  ) : (
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

  /* Hidden from the cell, but not from the user: the product name stays on the
   * title and the accessible name, so hovering or a screen reader still
   * identifies the hardware. Removing it from the layout is a density decision,
   * not a reason to withhold it. */
  const label = idOnly ? `${assetId} — ${assetName}` : undefined;

  if (!linked) {
    return (
      <div className={cn('min-w-0', className)} title={label}>
        {body}
      </div>
    );
  }

  return (
    <Link
      to={deviceDetailPath(assetId)}
      onClick={(event) => event.stopPropagation()}
      title={label}
      aria-label={label}
      className={cn('group block min-w-0 transition-colors hover:text-brand-200', className)}
    >
      {body}
    </Link>
  );
};
