import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes } from 'lucide-react';
import type { ApmAssetDto } from '@/services/apm.types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { exportReport, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination, TableToolbar } from '@/components/data';
import { DeviceIdentity } from '@/components/common';
import {
  APM_ASSET_COLUMNS,
  bandColor,
  money,
  orDash,
  pct,
  recommendedAction,
  riskColor,
} from '@/pages/apm/apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * The APM asset table.
 *
 * Nine analytics pages each need a table of the same records showing different
 * columns. A registry keyed by column name is what lets each page ask for the
 * six columns it cares about without any of them owning a copy of the row
 * renderers, the search, the pagination or the export.
 *
 * The export always writes the full column set rather than the visible one. A
 * reliability CSV that omits cost cannot be joined to a cost CSV, and the point
 * of exporting from an asset register is that the rows line up.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ApmColumnKey =
  | 'asset'
  | 'category'
  | 'status'
  | 'health'
  | 'band'
  | 'pdmHealth'
  | 'rul'
  | 'anomalies'
  | 'availability'
  | 'inherent'
  | 'mtbf'
  | 'mttr'
  | 'failureRate'
  | 'failures'
  | 'downtime'
  | 'downtimeCost'
  | 'utilisation'
  | 'effectiveAge'
  | 'criticality'
  | 'risk'
  | 'priority'
  | 'exposure'
  | 'lifecycle'
  | 'workOrders'
  | 'action';

const stripBrandName = (name: string, brand?: string): string => {
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) {
    const trimmed = name.slice(brand.length).trim();
    if (trimmed) return trimmed;
  }
  const knownBrands = [
    'Baseus', 'Samsung', 'Ugreen', 'Anker', 'Belkin', 'Apple', 'Dell', 'HP', 'Lenovo',
    'Daikin', 'Voltas', 'Blue Star', 'LG', 'Mitsubishi', 'Carrier', 'Hitachi', 'Panasonic', 'Lloyd', 'Godrej'
  ];
  for (const b of knownBrands) {
    if (name.toLowerCase().startsWith(b.toLowerCase())) {
      const trimmed = name.slice(b.length).trim();
      if (trimmed) return trimmed;
    }
  }
  return name;
};

const num = (value: number | undefined, decimals = 1, suffix = '') => (
  <span className="text-[12px] tabular-nums text-fg-soft">{orDash(value, decimals, suffix)}</span>
);

const REGISTRY: Record<ApmColumnKey, ColumnDef<ApmAssetDto, unknown>> = {
  asset: {
    id: 'asset',
    header: 'Asset',
    accessorFn: (row) => row.asset_id,
    enableSorting: true,
    meta: { width: '17rem' },
    cell: ({ row }) => (
      <DeviceIdentity
        assetId={row.original.asset_id}
        assetName={stripBrandName(row.original.asset_name, row.original.brand)}
        meta={row.original.brand}
      />
    ),
  },
  category: {
    id: 'category',
    header: 'Class',
    accessorFn: (row) => row.category,
    enableSorting: true,
    cell: ({ row }) => <span className="text-[12px] text-fg-soft">{row.original.category}</span>,
  },
  status: {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => row.status,
    enableSorting: true,
    cell: ({ row }) => (
      <Badge tone={row.original.status === 'Online' ? 'good' : 'neutral'} size="xs">
        {row.original.status}
      </Badge>
    ),
  },
  health: {
    id: 'health',
    header: 'Health index',
    accessorFn: (row) => row.health_index,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: bandColor(row.original.health_index_band) }}
          aria-hidden
        />
        <span className="text-[12px] tabular-nums text-fg-soft">{pct(row.original.health_index)}</span>
      </span>
    ),
  },
  band: {
    id: 'band',
    header: 'Band',
    accessorFn: (row) => row.health_index_band,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-[12px] capitalize text-fg-soft">{row.original.health_index_band}</span>
    ),
  },
  pdmHealth: {
    id: 'pdmHealth',
    header: 'PdM score',
    accessorFn: (row) => row.inputs?.predictive?.health_score,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.inputs?.predictive?.health_score, 1, '%'),
  },
  rul: {
    id: 'rul',
    header: 'RUL',
    accessorFn: (row) => row.inputs?.predictive?.rul_days,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.inputs?.predictive?.rul_days, 1, ' d'),
  },
  anomalies: {
    id: 'anomalies',
    header: 'Open anomalies',
    accessorFn: (row) => row.inputs?.anomaly_detection?.open_total,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.inputs?.anomaly_detection?.open_total, 0),
  },
  availability: {
    id: 'availability',
    header: 'Availability',
    accessorFn: (row) => row.availability_pct,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.availability_pct, 2, '%'),
  },
  inherent: {
    id: 'inherent',
    header: 'Inherent avail.',
    accessorFn: (row) => row.inherent_availability_pct,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.inherent_availability_pct, 2, '%'),
  },
  mtbf: {
    id: 'mtbf',
    header: 'MTBF',
    accessorFn: (row) => row.mtbf_hours,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => (
      <span className={cn('text-[12px] tabular-nums', row.original.mtbf_censored ? 'text-fg-faint' : 'text-fg-soft')}>
        {orDash(row.original.mtbf_hours, 1, ' h')}
        {row.original.mtbf_censored ? <span className="ml-1 text-[10px]">censored</span> : null}
      </span>
    ),
  },
  mttr: {
    id: 'mttr',
    header: 'MTTR',
    accessorFn: (row) => row.mttr_minutes,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => (
      <span className={cn('text-[12px] tabular-nums', row.original.mttr_censored ? 'text-fg-faint' : 'text-fg-soft')}>
        {orDash(row.original.mttr_minutes, 1, ' min')}
      </span>
    ),
  },
  failureRate: {
    id: 'failureRate',
    header: 'Failure rate',
    accessorFn: (row) => row.failure_rate_per_1000h,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.failure_rate_per_1000h, 2, ' /1000h'),
  },
  failures: {
    id: 'failures',
    header: 'Failures',
    accessorFn: (row) => row.failures,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.failures, 0),
  },
  downtime: {
    id: 'downtime',
    header: 'Downtime',
    accessorFn: (row) => row.downtime_hours,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.downtime_hours, 1, ' h'),
  },
  downtimeCost: {
    id: 'downtimeCost',
    header: 'Downtime cost',
    accessorFn: (row) => row.downtime_cost,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => <span className="text-[12px] tabular-nums text-fg-soft">{money(row.original.downtime_cost)}</span>,
  },
  utilisation: {
    id: 'utilisation',
    header: 'Utilisation',
    accessorFn: (row) => row.utilisation_pct,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.utilisation_pct, 1, '%'),
  },
  effectiveAge: {
    id: 'effectiveAge',
    header: 'Effective age',
    accessorFn: (row) => row.effective_age_days,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => (
      <span className="text-[12px] tabular-nums text-fg-soft">
        {orDash(row.original.effective_age_days, 0, ' d')}
        {row.original.ageing_factor ? (
          <span className="ml-1 text-[10px] text-fg-faint">×{formatNumber(row.original.ageing_factor, 2)}</span>
        ) : null}
      </span>
    ),
  },
  criticality: {
    id: 'criticality',
    header: 'Criticality',
    accessorFn: (row) => row.criticality_score,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-[12px] text-fg-soft">
        {row.original.criticality_label}
        <span className="ml-1.5 tabular-nums text-fg-faint">{orDash(row.original.criticality_score, 0)}</span>
      </span>
    ),
  },
  risk: {
    id: 'risk',
    header: 'Risk',
    accessorFn: (row) => row.risk_score,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: riskColor(row.original.risk_tier) }}
          aria-hidden
        />
        <span className="text-[12px] tabular-nums text-fg-soft">{orDash(row.original.risk_score, 0)}</span>
        <span className="text-[10.5px] capitalize text-fg-faint">{row.original.risk_tier}</span>
      </span>
    ),
  },
  priority: {
    id: 'priority',
    header: 'Priority',
    accessorFn: (row) => row.priority_rank,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => (
      <span className="text-[12px] text-fg-soft">
        {row.original.priority}
        <span className="ml-1.5 tabular-nums text-fg-faint">#{row.original.priority_rank ?? '—'}</span>
      </span>
    ),
  },
  exposure: {
    id: 'exposure',
    header: 'Cost exposure',
    accessorFn: (row) => row.cost_exposure,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => <span className="text-[12px] tabular-nums text-fg-soft">{money(row.original.cost_exposure)}</span>,
  },
  lifecycle: {
    id: 'lifecycle',
    header: 'Lifecycle',
    accessorFn: (row) => row.lifecycle_decision,
    enableSorting: true,
    cell: ({ row }) => <span className="text-[12px] text-fg-soft">{row.original.lifecycle_decision}</span>,
  },
  workOrders: {
    id: 'workOrders',
    header: 'Open WOs',
    accessorFn: (row) => row.open_work_orders,
    enableSorting: true,
    meta: { numeric: true, align: 'right' },
    cell: ({ row }) => num(row.original.open_work_orders, 0),
  },
  action: {
    id: 'action',
    header: 'Recommended action',
    accessorFn: (row) => recommendedAction(row),
    enableSorting: false,
    meta: { width: '20rem' },
    cell: ({ row }) => (
      <span className="block truncate text-[12px] text-fg-dim" title={recommendedAction(row.original)}>
        {recommendedAction(row.original)}
      </span>
    ),
  },
};

const PAGE_SIZES = [10, 25, 50, 100];

export interface ApmAssetTableProps {
  assets: ApmAssetDto[];
  columns: ApmColumnKey[];
  title: string;
  subtitle: string;
  /** Filename stem for the export. */
  exportName: string;
  minWidth?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const ApmAssetTable = ({
  assets,
  columns,
  title,
  subtitle,
  exportName,
  minWidth = '84rem',
  emptyTitle = 'No assets in scope',
  emptyDescription = 'Clear a filter to widen the selection.',
}: ApmAssetTableProps) => {
  const { density } = useUI();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [format, setFormat] = useState<ReportFormat>('csv');

  const debounced = useDebounce(search, 240);

  const rows = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) =>
      `${asset.asset_id} ${asset.asset_name} ${asset.category} ${asset.brand} ${asset.model} ${asset.risk_tier} ${asset.criticality_label} ${asset.lifecycle_decision}`
        .toLowerCase()
        .includes(needle),
    );
  }, [assets, debounced]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const defs = useMemo(() => columns.map((key) => REGISTRY[key]), [columns]);

  const runExport = () => {
    if (rows.length === 0) {
      toast.warning('Nothing to export', 'The current selection returns no assets.');
      return;
    }
    void exportReport(format, rows, APM_ASSET_COLUMNS, {
      filename: exportName,
      title,
      subtitle: `${rows.length} assets`,
      notes: ['Full APM column set — the visible columns are a view, the export is the record.'],
    });
    toast.success('Export started', `${rows.length} assets to ${format.toUpperCase()}.`);
  };

  return (
    <DataTable<ApmAssetDto>
      data={paged}
      columns={defs}
      rowKey={(row) => row.asset_id}
      density={density}
      minWidth={minWidth}
      emptyIcon={Boxes}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      toolbar={
        <TableToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search asset, class, brand, risk or lifecycle…"
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
          noun="assets"
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
