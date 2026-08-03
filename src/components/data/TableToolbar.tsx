import type { ReactNode } from 'react';
import { Download, Search, SlidersHorizontal, X } from 'lucide-react';
import type { SelectOption } from '@/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';

export interface FilterDef {
  key: string;
  label: string;
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: string) => void;
}

export interface TableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  onReset?: () => void;
  onExport?: () => void;
  activeFilterCount?: number;
  children?: ReactNode;
  className?: string;
}

/** Filters sit in one row above the table, per the chart-composition rules. */
export const TableToolbar = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onReset,
  onExport,
  activeFilterCount = 0,
  children,
  className,
}: TableToolbarProps) => (
  <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}>
    <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
      <Input
        type="search"
        icon={Search}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        containerClassName="sm:max-w-xs"
        trailing={
          search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="rounded-md p-1.5 text-fg-dim transition-colors hover:bg-overlay/5 hover:text-fg"
            >
              <X size={13} aria-hidden />
            </button>
          ) : undefined
        }
      />

      {filters.length > 0 ? (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5">
          <SlidersHorizontal size={14} className="shrink-0 text-fg-faint" aria-hidden />
          {filters.map((filter) => (
            <Select
              key={filter.key}
              size="sm"
              aria-label={filter.label}
              options={filter.options}
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
              containerClassName="min-w-[8.5rem] shrink-0"
            />
          ))}
        </div>
      ) : null}
    </div>

    <div className="flex items-center gap-2">
      {children}
      {activeFilterCount > 0 ? (
        <Badge tone="brand" size="sm">
          {activeFilterCount} active
        </Badge>
      ) : null}
      {onReset && activeFilterCount > 0 ? (
        <Button variant="ghost" size="sm" icon={X} onClick={onReset}>
          Reset
        </Button>
      ) : null}
      {onExport ? (
        <Button variant="secondary" size="sm" icon={Download} onClick={onExport}>
          Export
        </Button>
      ) : null}
    </div>
  </div>
);
