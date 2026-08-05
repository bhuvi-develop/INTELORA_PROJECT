import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronRight, Download, ListFilter } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/common';
import type { ReportFormat } from '@/utils/report';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared chrome for the APM analytics pages.
 *
 * Nine pages carry the same frame — breadcrumb, back control, header, a sticky
 * filter rail and an export control. Building it once means a change to the
 * frame happens once, and it keeps each analytics page to the thing it is
 * actually about.
 *
 * The back control routes to a known destination rather than calling
 * `navigate(-1)`. These pages are reachable from a bookmark, a refresh or a
 * sibling page, and in each of those cases history-back lands somewhere the
 * label did not promise.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ApmPageShellProps {
  title: string;
  subtitle: string;
  /** Trailing breadcrumb label. The Cockpit → APM prefix is always present. */
  crumb: string;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  /** Controls for the sticky filter rail. Omit to hide the rail entirely. */
  filters?: ReactNode;
  /** Note under the filter rail — usually what the filters cannot narrow. */
  filterNote?: ReactNode;
  onResetFilters?: () => void;
  activeFilterCount?: number;
  /** Wire up the export control. Omit to hide it. */
  exportFormat?: ReportFormat;
  onExportFormatChange?: (format: ReportFormat) => void;
  onExport?: () => void;
  loading?: boolean;
  error?: boolean;
  children: ReactNode;
}

export const ApmPageShell = ({
  title,
  subtitle,
  crumb,
  eyebrow,
  meta,
  filters,
  filterNote,
  onResetFilters,
  activeFilterCount = 0,
  exportFormat,
  onExportFormatChange,
  onExport,
  loading = false,
  error = false,
  children,
}: ApmPageShellProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-[11.5px] text-fg-dim">
          <li>
            <Link to={PATHS.cockpit} className="transition-colors hover:text-fg-soft">
              Cockpit
            </Link>
          </li>
          <li aria-hidden className="text-fg-faint">
            <ChevronRight size={12} />
          </li>
          <li>
            <Link to={`${PATHS.apm}?tab=overview`} className="transition-colors hover:text-fg-soft">
              Asset Performance
            </Link>
          </li>
          <li aria-hidden className="text-fg-faint">
            <ChevronRight size={12} />
          </li>
          <li className="font-medium text-fg-soft" aria-current="page">
            {crumb}
          </li>
        </ol>
      </nav>

      <PageHeader
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrow}
        meta={meta}
        actions={
          onExport ? (
            <>
              <Select
                size="sm"
                aria-label="Export format"
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'excel', label: 'Excel' },
                  { value: 'pdf', label: 'PDF' },
                ]}
                value={exportFormat ?? 'csv'}
                onChange={(event) => onExportFormatChange?.(event.target.value as ReportFormat)}
                containerClassName="w-24"
              />
              <Button variant="primary" size="sm" icon={Download} onClick={onExport}>
                Export
              </Button>
            </>
          ) : undefined
        }
      />



      {filters ? (
        <div>
          <Card className="backdrop-blur-md">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 pb-1.5 pr-1">
                <ListFilter size={14} className="shrink-0 text-fg-muted" aria-hidden />
                <span className="eyebrow">Filters</span>
              </div>

              {filters}

              {activeFilterCount > 0 && onResetFilters ? (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={onResetFilters}>
                  Reset
                </Button>
              ) : null}
            </div>

            {filterNote ? (
              <p className="mt-3 border-t border-overlay/[0.06] pt-2.5 text-[10.5px] leading-relaxed text-fg-faint">
                {filterNote}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="APM analytics unavailable"
            description="The APM engine did not answer. It derives its view from Anomaly Detection and Predictive Maintenance outputs, so it stays empty rather than showing figures it could not compute."
          />
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Card key={index}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-20" />
              <Skeleton className="mt-3 h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
};

/* ─── Section entry ──────────────────────────────────────────────────────── */

export interface ApmSectionCardProps {
  title: string;
  description: string;
  to: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  accent: string;
  /** Two or three headline figures, already formatted. */
  figures?: Array<{ label: string; value: string }>;
}

/**
 * One navigable section on the module overview.
 *
 * Carries the name, a line on what the page answers and at most three figures —
 * enough to decide whether to open it, and deliberately not enough to be a
 * second dashboard competing with the page it links to.
 */
export const ApmSectionCard = ({
  title,
  description,
  to,
  icon: Icon,
  accent,
  figures = [],
}: ApmSectionCardProps) => {
  const navigate = useNavigate();

  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`${title} — view analytics`}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between gap-4 pl-5',
        'hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60',
      )}
      interactive
      onClick={() => navigate(to)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        navigate(to);
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = `inset 0 0 0 1px ${accent}59, 0 8px 26px -12px ${accent}4D`;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = '';
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={18} />
        </span>

        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold leading-snug tracking-[-0.005em] text-fg">{title}</h3>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">{description}</p>
        </div>
      </div>

      {figures.length > 0 ? (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-overlay/[0.06] pt-3">
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                {figure.label}
              </dt>
              <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-fg">{figure.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <span className="relative z-10 self-start">
        <Button
          variant="subtle"
          size="sm"
          iconRight={ChevronRight}
          onClick={(event) => {
            event.stopPropagation();
            navigate(to);
          }}
        >
          View Analytics
        </Button>
      </span>
    </Card>
  );
};

/** Small badge used by pages that read a subset of the estate. */
export const ScopeBadge = ({ count, noun = 'assets' }: { count: number; noun?: string }) => (
  <Badge tone="brand" size="sm">
    {count} {noun}
  </Badge>
);
