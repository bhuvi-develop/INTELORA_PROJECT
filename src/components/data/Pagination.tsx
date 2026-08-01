import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

export interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  /** Noun used in the range summary ("assets", "anomalies"). */
  noun?: string;
}

export const Pagination = ({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  noun = 'records',
}: PaginationProps) => {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const windowed = (): number[] => {
    const span = 5;
    if (pageCount <= span) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(page - 2, pageCount - span + 1));
    return Array.from({ length: span }, (_, i) => start + i);
  };

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="text-[11.5px] tabular-nums text-fg-dim">
        Showing <span className="font-semibold text-fg-soft">{formatNumber(first)}</span>–
        <span className="font-semibold text-fg-soft">{formatNumber(last)}</span> of{' '}
        <span className="font-semibold text-fg-soft">{formatNumber(total)}</span> {noun}
      </p>

      <div className="flex items-center gap-2.5">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[11.5px] text-fg-dim">Rows</span>
            <Select
              size="sm"
              aria-label="Rows per page"
              options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              containerClassName="w-[4.75rem]"
            />
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <IconButton
            icon={ChevronsLeft}
            label="First page"
            size="xs"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          />
          <IconButton
            icon={ChevronLeft}
            label="Previous page"
            size="xs"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          />

          <div className="mx-0.5 hidden items-center gap-0.5 sm:flex">
            {windowed().map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => onPageChange(candidate)}
                aria-current={candidate === page ? 'page' : undefined}
                className={cn(
                  'h-7 min-w-7 rounded-lg px-1.5 text-[11.5px] font-medium tabular-nums transition-colors',
                  candidate === page
                    ? 'bg-brand-500/18 text-brand-100 ring-1 ring-inset ring-brand-400/30'
                    : 'text-fg-dim hover:bg-overlay/[0.06] hover:text-fg-soft',
                )}
              >
                {candidate}
              </button>
            ))}
          </div>

          <span className="px-1.5 text-[11.5px] tabular-nums text-fg-dim sm:hidden">
            {page} / {pageCount}
          </span>

          <IconButton
            icon={ChevronRight}
            label="Next page"
            size="xs"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          />
          <IconButton
            icon={ChevronsRight}
            label="Last page"
            size="xs"
            disabled={page >= pageCount}
            onClick={() => onPageChange(pageCount)}
          />
        </div>
      </div>
    </div>
  );
};
