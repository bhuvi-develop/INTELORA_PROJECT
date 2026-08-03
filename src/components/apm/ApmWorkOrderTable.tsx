import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList } from 'lucide-react';
import type { ApmWorkOrder } from '@/services/apm.types';
import { formatDateTime, formatRelative } from '@/utils/format';
import { exportReport, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination, TableToolbar } from '@/components/data';
import { WORK_ORDER_COLUMNS, money, orDash } from '@/pages/apm/apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * The work order queue.
 *
 * A work order is where a prediction becomes an instruction, so the table shows
 * the provenance as well as the task: `origin` says which upstream module
 * caused it to be raised, and `planned` says whether it was scheduled or forced.
 * Those two columns are what a reliability review actually argues about.
 *
 * Dates are rendered relative with the absolute stamp on hover. An operator
 * reading a queue cares that something is four days overdue, not that it was
 * raised at 14:07 on Tuesday — but the exact stamp has to be recoverable.
 * ─────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZES = [10, 25, 50, 100];

const STATUS_TONE: Record<string, 'good' | 'warning' | 'critical' | 'brand' | 'neutral'> = {
  Open: 'warning',
  Approved: 'brand',
  Assigned: 'brand',
  'In Progress': 'brand',
  Completed: 'good',
  Verified: 'good',
  Cancelled: 'neutral',
};

const PRIORITY_TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  Critical: 'critical',
  High: 'critical',
  Medium: 'warning',
  Low: 'neutral',
};

const stamp = (value: string | null | undefined) =>
  value ? (
    <span className="text-[11.5px] text-fg-dim" title={formatDateTime(new Date(value).getTime())}>
      {formatRelative(new Date(value).getTime())}
    </span>
  ) : (
    <span className="text-[11.5px] text-fg-faint">—</span>
  );


export interface ApmWorkOrderTableProps {
  orders: ApmWorkOrder[];
  title: string;
  subtitle: string;
  exportName: string;
}

export const ApmWorkOrderTable = ({ orders, title, subtitle, exportName }: ApmWorkOrderTableProps) => {
  const { density } = useUI();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [format, setFormat] = useState<ReportFormat>('csv');

  const debounced = useDebounce(search, 240);

  const rows = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) =>
      `${order.work_order_id} ${order.asset_id} ${order.asset_name ?? ''} ${order.title ?? ''} ${order.status} ${order.priority ?? ''} ${order.assignee ?? ''} ${order.origin ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [orders, debounced]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const columns = useMemo<Array<ColumnDef<ApmWorkOrder, unknown>>>(
    () => [
      {
        id: 'id',
        header: 'Work order',
        accessorFn: (row) => row.work_order_id,
        enableSorting: true,
        meta: { width: '9.5rem' },
        cell: ({ row }) => (
          <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">
            {row.original.work_order_id}
          </span>
        ),
      },
      {
        id: 'asset',
        header: 'Asset',
        accessorFn: (row) => row.asset_id,
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => (
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-fg">{row.original.asset_id}</span>
            <span className="block truncate text-[11px] text-fg-dim">{row.original.asset_name ?? ''}</span>
          </span>
        ),
      },
      {
        id: 'title',
        header: 'Issue',
        accessorFn: (row) => row.title ?? '',
        enableSorting: true,
        meta: { width: '20rem' },
        cell: ({ row }) => (
          <span className="block truncate text-[12px] text-fg-soft" title={row.original.description ?? ''}>
            {row.original.title ?? '—'}
          </span>
        ),
      },
      {
        id: 'origin',
        header: 'Origin',
        accessorFn: (row) => row.origin ?? '',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-fg-soft">{row.original.origin ?? '—'}</span>
            <span className="block text-[10.5px] text-fg-faint">
              {row.original.planned ? 'planned' : 'reactive'}
            </span>
          </span>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorFn: (row) => row.priority_score ?? 0,
        enableSorting: true,
        cell: ({ row }) => (
          <Badge tone={PRIORITY_TONE[String(row.original.priority)] ?? 'neutral'} size="xs">
            {row.original.priority ?? '—'}
          </Badge>
        ),
      },
      {
        id: 'assignee',
        header: 'Assigned to',
        accessorFn: (row) => row.assignee ?? '',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] text-fg-soft">{row.original.assignee ?? 'Unassigned'}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status] ?? 'neutral'} size="xs">
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'raised',
        header: 'Raised',
        accessorFn: (row) => row.raised_at ?? '',
        enableSorting: true,
        cell: ({ row }) => stamp(row.original.raised_at),
      },
      {
        id: 'due',
        header: 'Due',
        accessorFn: (row) => row.due_at ?? '',
        enableSorting: true,
        cell: ({ row }) => (
          <span className={row.original.is_overdue ? 'text-rose-300' : undefined}>
            {stamp(row.original.due_at)}
          </span>
        ),
      },
      {
        id: 'cost',
        header: 'Est. cost',
        accessorFn: (row) => row.estimated_cost ?? 0,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {money(row.original.estimated_cost)}
            <span className="ml-1 text-[10.5px] text-fg-faint">
              {orDash(row.original.estimated_hours, 1, ' h')}
            </span>
          </span>
        ),
      },
    ],
    [],
  );

  const runExport = () => {
    if (rows.length === 0) {
      toast.warning('Nothing to export', 'The current selection returns no work orders.');
      return;
    }
    void exportReport(format, rows, WORK_ORDER_COLUMNS, {
      filename: exportName,
      title,
      subtitle: `${rows.length} work orders`,
    });
    toast.success('Export started', `${rows.length} work orders to ${format.toUpperCase()}.`);
  };

  return (
    <DataTable<ApmWorkOrder>
      data={paged}
      columns={columns}
      rowKey={(row) => row.work_order_id}
      density={density}
      minWidth="104rem"
      emptyIcon={ClipboardList}
      emptyTitle="No work orders in scope"
      emptyDescription="APM raises an order when an asset's recommended action requires one. An empty queue means nothing currently does."
      toolbar={
        <TableToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search order, asset, issue, assignee or origin…"
          onExport={runExport}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">{title}</p>
            <p className="mt-0.5 text-[11.5px] text-fg-dim">{subtitle}</p>
          </div>
          <Select
            size="sm"
            aria-label="Export format"
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'excel', label: 'Excel' },
              { value: 'pdf', label: 'PDF' },
            ]}
            value={format}
            onChange={(event) => setFormat(event.target.value as ReportFormat)}
            containerClassName="w-24"
          />
        </TableToolbar>
      }
      footer={
        <Pagination
          page={safePage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={rows.length}
          noun="work orders"
          pageSizeOptions={PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      }
    />
  );
};
