import { useMemo, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, type LucideIcon } from 'lucide-react';
import type { ColumnMeta } from '@/types';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';

export interface DataTableProps<T> {
  data: T[];
  columns: Array<ColumnDef<T, unknown>>;
  loading?: boolean;
  /** Client-side sorting when uncontrolled; pass both to lift sorting to the server. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  density?: 'comfortable' | 'compact';
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Minimum table width before horizontal scroll engages. */
  minWidth?: string;
}

const alignClass = (meta: ColumnMeta | undefined): string => {
  if (meta?.align === 'right' || meta?.numeric) return 'text-right';
  if (meta?.align === 'center') return 'text-center';
  return 'text-left';
};

export const DataTable = <T,>({
  data,
  columns,
  loading = false,
  sorting,
  onSortingChange,
  manualSorting = false,
  onRowClick,
  rowKey,
  density = 'comfortable',
  emptyIcon = Inbox,
  emptyTitle = 'No records match the current filters',
  emptyDescription = 'Adjust the search term or clear one of the active filters to widen the result set.',
  toolbar,
  footer,
  className,
  minWidth = '68rem',
}: DataTableProps<T>) => {
  const controlled = sorting !== undefined && onSortingChange !== undefined;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualSorting,
    state: controlled ? { sorting } : undefined,
    onSortingChange: controlled ? onSortingChange : undefined,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const cellPadding = density === 'compact' ? 'px-3.5 py-2' : 'px-4 py-3';
  const headerPadding = density === 'compact' ? 'px-3.5 py-2.5' : 'px-4 py-3';

  const columnCount = useMemo(() => table.getAllLeafColumns().length, [table]);

  return (
    <div className={cn('panel flex flex-col overflow-hidden', className)}>
      {toolbar ? <div className="border-b border-overlay/[0.06] p-3.5">{toolbar}</div> : null}

      {loading ? (
        <SkeletonRows rows={density === 'compact' ? 10 : 8} cols={Math.min(6, columnCount)} />
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="scroll-x">
          <table className="w-full border-collapse" style={{ minWidth }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-overlay/[0.07] bg-ink-850/40">
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={meta?.width ? { width: meta.width } : undefined}
                        onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          'sticky top-0 z-10 whitespace-nowrap bg-ink-850/90 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-dim backdrop-blur transition-colors',
                          sortable && 'cursor-pointer select-none hover:bg-ink-800 hover:text-fg',
                          headerPadding,
                          alignClass(meta),
                        )}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      >
                        {sortable ? (
                          <div
                            className={cn(
                              'inline-flex items-center gap-1.5 transition-colors',
                              meta?.align === 'right' || meta?.numeric ? 'flex-row-reverse' : '',
                              sorted ? 'text-brand-400 font-bold' : '',
                            )}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp size={12} className="text-brand-400 shrink-0" aria-hidden />
                            ) : sorted === 'desc' ? (
                              <ArrowDown size={12} className="text-brand-400 shrink-0" aria-hidden />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-45 shrink-0" aria-hidden />
                            )}
                          </div>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-overlay/[0.045]">
              {rows.map((row: Row<T>) => (
                <tr
                  key={rowKey(row.original)}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={cn('row-hover', onRowClick && 'cursor-pointer focus:bg-overlay/[0.05] focus:outline-none')}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'align-middle text-[12.5px] text-fg-soft',
                          cellPadding,
                          alignClass(meta),
                          meta?.numeric && 'tabular-nums',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {footer ? <div className="border-t border-overlay/[0.06] px-3.5 py-3">{footer}</div> : null}
    </div>
  );
};
