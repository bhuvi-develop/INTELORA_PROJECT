import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Download, MonitorSmartphone, Radio, WifiOff } from 'lucide-react';
import type { Device, DeviceStatus } from '@/engine/types';
import { DEVICE_BRANDS, DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { deviceDetailPath } from '@/routes/paths';
import { useAssetList, useFleetKpis } from '@/engine/store';
import { exportReport, type ReportColumn } from '@/utils/report';
import { formatNumber } from '@/utils/format';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, TableToolbar } from '@/components/data';
import type { FilterDef } from '@/components/data';
import { MetaStat, PageHeader, StatusBadge } from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Device register.
 *
 * The table shows exactly the six asset fields the product defines and nothing
 * else — no condition, telemetry or prediction columns. Those belong to the
 * detail tabs and the analytics modules. Search, filters and pagination are
 * navigation affordances, not additional asset attributes.
 * ─────────────────────────────────────────────────────────────────────────── */

const STATUS_OPTIONS: Array<{ value: DeviceStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'Online', label: 'Online' },
  { value: 'Standby', label: 'Standby' },
  { value: 'Offline', label: 'Offline' },
];

const PAGE_SIZES = [10, 25, 50, 100];

export const DevicesPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const assets = useAssetList();
  const kpis = useFleetKpis();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DeviceStatus | 'all'>('all');
  const [category, setCategory] = useState<string>('all');
  const [brand, setBrand] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'assetId', desc: false }]);

  const debouncedSearch = useDebounce(search, 240);

  /* The register is a projection of the live snapshot, so a status change
   * appears here on the same tick it appears everywhere else. */
  const devices = useMemo<Device[]>(() => assets.map((asset) => asset.device), [assets]);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return devices.filter((device) => {
      if (status !== 'all' && device.status !== status) return false;
      if (category !== 'all' && device.category !== category) return false;
      if (brand !== 'all' && device.brand !== brand) return false;
      if (needle.length > 0) {
        const haystack =
          `${device.assetId} ${device.assetName} ${device.category} ${device.brand} ${device.model}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [devices, debouncedSearch, status, category, brand]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const columns = useMemo<Array<ColumnDef<Device, unknown>>>(
    () => [
      {
        id: 'assetId',
        header: 'Asset ID',
        accessorFn: (row) => row.assetId,
        enableSorting: true,
        meta: { width: '9rem' },
        cell: ({ row }) => (
          <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">
            {row.original.assetId}
          </span>
        ),
      },
      {
        id: 'assetName',
        header: 'Asset Name',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '20rem' },
        cell: ({ row }) => <span className="text-[12.5px] font-semibold text-fg">{row.original.assetName}</span>,
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row) => row.category,
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => <span className="text-[12px] text-fg-soft">{row.original.category}</span>,
      },
      {
        id: 'brand',
        header: 'Brand',
        accessorFn: (row) => row.brand,
        enableSorting: true,
        meta: { width: '10rem' },
        cell: ({ row }) => <span className="text-[12px] text-fg-soft">{row.original.brand}</span>,
      },
      {
        id: 'model',
        header: 'Model',
        accessorFn: (row) => row.model,
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => <span className="font-mono text-[11.5px] text-fg-muted">{row.original.model}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <StatusBadge status={row.original.status} size="xs" />
          </div>
        ),
      },
    ],
    [],
  );

  const filters: FilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      value: status,
      options: STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setStatus(value as DeviceStatus | 'all');
        setPage(1);
      },
    },
    {
      key: 'category',
      label: 'Category',
      value: category,
      options: [
        { value: 'all', label: 'All categories' },
        ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
      ],
      onChange: (value) => {
        setCategory(value);
        setPage(1);
      },
    },
    {
      key: 'brand',
      label: 'Brand',
      value: brand,
      options: [{ value: 'all', label: 'All brands' }, ...DEVICE_BRANDS.map((entry) => ({ value: entry, label: entry }))],
      onChange: (value) => {
        setBrand(value);
        setPage(1);
      },
    },
  ];

  const activeFilterCount = [status, category, brand].filter((value) => value !== 'all').length;

  const reset = useCallback(() => {
    setSearch('');
    setStatus('all');
    setCategory('all');
    setBrand('all');
    setPage(1);
  }, []);

  const exportColumns: Array<ReportColumn<Device>> = [
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Category', value: (row) => row.category },
    { header: 'Brand', value: (row) => row.brand },
    { header: 'Model', value: (row) => row.model },
    { header: 'Status', value: (row) => row.status },
  ];

  const exportRegister = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no devices.');
      return;
    }
    void exportReport('csv', filtered, exportColumns, {
      filename: 'intelora_device_register',
      title: 'Device Register',
      subtitle: `${filtered.length} of ${devices.length} devices`,
      notes: activeFilterCount > 0 ? [`${activeFilterCount} filter(s) applied`] : undefined,
    });
    toast.success('Export ready', `${filtered.length} devices written to CSV.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.devices.title}
        subtitle={MODULE_TITLES.devices.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={MonitorSmartphone}>
              {formatNumber(devices.length)} registered
            </Badge>
            <Badge tone="good" size="sm" icon={Radio}>
              {kpis.onlineAssets} online
            </Badge>
            {kpis.offlineAssets > 0 ? (
              <Badge tone="neutral" size="sm" icon={WifiOff}>
                {kpis.offlineAssets} offline
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Categories" value={formatNumber(DEVICE_CATEGORIES.length)} />
            <MetaStat label="Brands" value={formatNumber(DEVICE_BRANDS.length)} />
            <MetaStat label="Standby" value={formatNumber(kpis.standbyAssets)} />
            <MetaStat label="Showing" value={`${formatNumber(filtered.length)} of ${formatNumber(devices.length)}`} />
          </>
        }
        actions={
          <Button variant="primary" size="sm" icon={Download} onClick={exportRegister}>
            Export register
          </Button>
        }
      />

      <DataTable<Device>
        data={paged}
        columns={columns}
        rowKey={(row) => row.assetId}
        density={density}
        sorting={sorting}
        onSortingChange={setSorting}
        onRowClick={(row) => navigate(deviceDetailPath(row.assetId))}
        minWidth="72rem"
        emptyIcon={MonitorSmartphone}
        emptyTitle="No devices match the current filters"
        emptyDescription="Clear a filter or widen the search term. Every registered device appears in this register."
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search asset id, name, category, brand or model…"
            filters={filters}
            activeFilterCount={activeFilterCount}
            onReset={reset}
          />
        }
        footer={
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filtered.length}
            noun="devices"
            pageSizeOptions={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />

      <p className="text-[11px] leading-relaxed text-fg-dim">
        Select any row to open its detail view, where condition, live telemetry, anomalies, predictions and maintenance
        history are available as separate tabs.
      </p>
    </div>
  );
};
