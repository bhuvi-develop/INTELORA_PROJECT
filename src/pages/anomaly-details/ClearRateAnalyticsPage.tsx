import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Activity, Search, AlertTriangle, Download, Filter, ShieldCheck } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { PATHS } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatDateTime } from '@/utils/format';
import { useToast, useUI } from '@/hooks';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader } from '@/components/ui/Card';
import { AreaTrend, BarTrend, Heatmap, LineTrend, RadialGauge } from '@/components/charts';
import { DataTable } from '@/components/data';
import { PageHeader, SeverityBadge, DeviceIdentity, AnomalyStatusBadge } from '@/components/common';

const BUCKETS = 24;
const BUCKET_MS = 120_000;
const minuteFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const NOW = Date.now();
const STATIC_EVENTS = (Array.from({ length: 120 }).map((_, i) => {
  const isCleared = Math.random() > 0.4;
  const ts = NOW - Math.random() * BUCKETS * BUCKET_MS;
  return {
    id: `evt-${i}`,
    assetId: `LAP-${String((i % 8) + 1).padStart(3, '0')}`,
    assetName: 'Asset',
    category: 'Hardware',
    type: 'Overheating',
    code: `RUL-00${(i % 5) + 1}`,
    severity: (['Critical', 'Major', 'Warning', 'Info'] as const)[i % 4],
    observed: 100 + Math.random() * 50,
    threshold: 100,
    unit: 'U',
    status: isCleared ? 'Resolved' : 'Active',
    timestamp: ts,
    resolvedAt: isCleared ? ts + Math.random() * 30 * 60000 : null,
  };
}) as unknown) as AnomalyRecord[];

export const ClearRateAnalyticsPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const journal = STATIC_EVENTS;
  const at = NOW;

  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('24h');

  // We look at all events to track clear rates
  const allEvents = useMemo(() => journal, [journal]);

  // Derived timeline buckets
  const timeline = useMemo(() => {
    const out = [];
    for (let index = BUCKETS - 1; index >= 0; index -= 1) {
      const to = at - index * BUCKET_MS;
      const from = to - BUCKET_MS;
      
      const raised = allEvents.filter((r) => r.timestamp > from && r.timestamp <= to);
      const cleared = allEvents.filter((r) => r.resolvedAt !== null && r.resolvedAt > from && r.resolvedAt <= to);
      const acked = allEvents.filter((r) => r.status === 'Acknowledged' && r.timestamp > from && r.timestamp <= to);
      
      out.push({
        label: minuteFmt.format(new Date(to)),
        raised: raised.length,
        cleared: cleared.length,
        acked: acked.length,
        rate: raised.length > 0 ? (cleared.length / raised.length) * 100 : (cleared.length > 0 ? 100 : 0),
        mttr: cleared.length > 0 ? cleared.reduce((sum, r) => sum + ((r.resolvedAt! - r.timestamp) / 60000), 0) / cleared.length : 0,
      });
    }
    return out;
  }, [allEvents, at]);

  const totalRaised = allEvents.length;
  const totalCleared = allEvents.filter(e => e.resolvedAt !== null).length;
  const globalClearRate = totalRaised > 0 ? (totalCleared / totalRaised) * 100 : 100;
  
  const clearedEvents = allEvents.filter(e => e.resolvedAt !== null);
  const globalMttr = clearedEvents.length > 0 
    ? clearedEvents.reduce((sum, r) => sum + ((r.resolvedAt! - r.timestamp) / 60000), 0) / clearedEvents.length 
    : 0;

  // Clear time distribution (Histogram approx)
  const clearTimeDistribution = useMemo(() => {
    const bins = [
      { label: '< 1m', max: 1, count: 0 },
      { label: '1-5m', max: 5, count: 0 },
      { label: '5-15m', max: 15, count: 0 },
      { label: '15-60m', max: 60, count: 0 },
      { label: '> 1h', max: Infinity, count: 0 },
    ];
    clearedEvents.forEach(e => {
      const mins = (e.resolvedAt! - e.timestamp) / 60000;
      for (const bin of bins) {
        if (mins <= bin.max) {
          bin.count++;
          break;
        }
      }
    });
    return bins.map(b => ({ label: b.label, count: b.count }));
  }, [clearedEvents]);

  const deviceClearStatus = useMemo(() => {
    const counts: Record<string, { Cleared: number, Active: number }> = {};
    allEvents.forEach(e => {
      if (!counts[e.assetId]) counts[e.assetId] = { Cleared: 0, Active: 0 };
      if (e.resolvedAt) counts[e.assetId].Cleared++;
      else counts[e.assetId].Active++;
    });
    return Object.entries(counts).map(([id, st]) => ({ id, ...st })).sort((a, b) => (b.Cleared + b.Active) - (a.Cleared + a.Active)).slice(0, 8);
  }, [allEvents]);
  
  const topClearedDevices = useMemo(() => {
    return [...deviceClearStatus].sort((a, b) => b.Cleared - a.Cleared).map(d => ({ id: d.id, count: d.Cleared })).slice(0, 5);
  }, [deviceClearStatus]);

  const clearHeatmapData = useMemo(() => {
    const yAxis = Array.from(new Set(clearedEvents.map(e => e.assetId))).slice(0, 8);
    const xAxis = timeline.map(t => t.label).slice(-10);
    const data = yAxis.map(() => xAxis.map(() => ({ value: Math.floor(Math.random() * 4) })));
    return { xAxis, yAxis, data };
  }, [clearedEvents, timeline]);

  const tableColumns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(() => [
    { id: 'time', header: 'Detected', accessorFn: row => row.timestamp, cell: (info: any) => formatDateTime(info.row.original.timestamp), meta: { width: '10rem' } },
    { id: 'cleared', header: 'Cleared At', accessorFn: row => row.resolvedAt, cell: (info: any) => info.row.original.resolvedAt ? formatDateTime(info.row.original.resolvedAt) : '-', meta: { width: '10rem' } },
    { id: 'ttc', header: 'Time to Clear', accessorFn: row => row.resolvedAt ? (row.resolvedAt - row.timestamp) / 60000 : 0, cell: (info: any) => info.row.original.resolvedAt ? `${((info.row.original.resolvedAt - info.row.original.timestamp) / 60000).toFixed(1)}m` : '-', meta: { align: 'right' } },
    { id: 'device', header: 'Device', accessorFn: row => row.assetId, cell: (info: any) => <DeviceIdentity assetId={info.row.original.assetId} assetName={info.row.original.assetName} meta={info.row.original.category} idOnly /> },
    { id: 'severity', header: 'Severity', accessorFn: row => row.severity, cell: (info: any) => <SeverityBadge severity={info.row.original.severity} size="xs" /> },
    { id: 'status', header: 'Status', accessorFn: row => row.status, cell: (info: any) => <AnomalyStatusBadge status={info.row.original.status} size="xs" /> },
  ], []);

  const filteredEvents = useMemo(() => {
    return allEvents
      .filter(e => e.assetId.toLowerCase().includes(search.toLowerCase()) || e.code.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  }, [allEvents, search]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Button variant="ghost" size="sm" icon={ArrowLeft} className="mb-3 -ml-1" onClick={() => navigate(PATHS.anomalyActiveEvents)}>
          Back to Active Events
        </Button>
        <PageHeader 
          title="Clear Rate Analytics" 
          subtitle="Enterprise analytics for throughput, resolution velocity, and Mean Time to Resolution (MTTR)"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={Filter} onClick={() => toast.info('Filters', 'Advanced filters opened')}>Filters</Button>
              <Button variant="primary" size="sm" icon={Download} onClick={() => toast.success('Exported', 'Analytics report downloading...')}>Export PDF</Button>
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-4 p-4 border border-overlay/[0.06] rounded-xl bg-card">
        <Input icon={Search} placeholder="Search device, rule, failure mode..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-80" />
        <Select options={[{value: '24h', label: 'Last 24 Hours'}, {value: '7d', label: 'Last 7 Days'}]} value={timeRange} onChange={(e) => setTimeRange(e.target.value)} />
        <Select options={[{value: 'all', label: 'All Severities'}, {value: 'critical', label: 'Critical'}]} value="all" onChange={() => {}} />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {/* KPI Gauges */}
        <Card className="h-[280px]">
          <CardHeader title="Clear Rate %" subtitle="Overall event resolution rate" />
          <div className="p-4 flex justify-center items-center h-[200px]">
            <RadialGauge value={globalClearRate} max={100} size={180} label="Cleared" unit="%" color={globalClearRate > 80 ? STATUS_COLOR.good : STATUS_COLOR.warning} />
          </div>
        </Card>
        <Card className="h-[280px]">
          <CardHeader title="Average Clear Time" subtitle="Global MTTR" />
          <div className="p-4 flex justify-center items-center h-[200px]">
            <RadialGauge value={globalMttr} max={60} size={180} label="MTTR" unit="m" color={globalMttr < 15 ? STATUS_COLOR.good : STATUS_COLOR.warning} />
          </div>
        </Card>
        <div className="xl:col-span-2">
           <LineTrend title="MTTR Trend" subtitle="Mean Time to Resolution over time" icon={Activity} data={timeline} series={[{ key: 'mttr', name: 'MTTR (min)', color: SERIES[4], decimals: 1 }]} height={280} />
        </div>
      </div>

      {/* Timelines (Individual) */}
      <div className="grid gap-4 xl:grid-cols-3">
        <BarTrend title="Raised Events" subtitle="Total events generated" icon={AlertTriangle} data={timeline} series={[{ key: 'raised', name: 'Raised', color: STATUS_COLOR.warning, decimals: 0 }]} height={260} />
        <BarTrend title="Self Cleared Events" subtitle="Events resolved without intervention" icon={ShieldCheck} data={timeline} series={[{ key: 'cleared', name: 'Cleared', color: STATUS_COLOR.good, decimals: 0 }]} height={260} />
        <LineTrend title="Acknowledged Events" subtitle="Events claimed by operators" icon={Activity} data={timeline} series={[{ key: 'acked', name: 'Acknowledged', color: SERIES[3], decimals: 0 }]} height={260} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AreaTrend title="Cleared vs Raised %" subtitle="Dynamic clear rate percentage tracking" icon={Activity} data={timeline} series={[{ key: 'rate', name: 'Clear Rate %', color: SERIES[0], decimals: 1 }]} height={300} />
        <BarTrend title="Clear Time Distribution" subtitle="Histogram of resolution speeds" icon={Activity} data={clearTimeDistribution} series={[{ key: 'count', name: 'Events', color: SERIES[1], decimals: 0 }]} height={300} categoryWidth={80} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend title="Device-wise Clear Status" subtitle="Breakdown of active vs cleared events per device" icon={Activity} data={deviceClearStatus} series={[
            { key: 'Cleared', name: 'Cleared', color: STATUS_COLOR.good, decimals: 0 },
            { key: 'Active', name: 'Active', color: STATUS_COLOR.warning, decimals: 0 },
          ]} height={320} categoryWidth={80} />
        <BarTrend title="Top Cleared Devices" subtitle="Devices with the most resolved events" icon={Activity} data={topClearedDevices} series={[{ key: 'count', name: 'Cleared', color: SERIES[2], decimals: 0 }]} layout="horizontal" height={320} categoryWidth={120} />
      </div>

      <div className="grid gap-4 xl:grid-cols-1">
        <Heatmap 
          title="Clear Events Heatmap" 
          subtitle="Resolution activity concentration across fleet" 
          cells={clearHeatmapData.yAxis.flatMap((row, y) => clearHeatmapData.xAxis.map((_col, x) => ({ row, col: x, value: clearHeatmapData.data[y][x].value })))} 
          rows={clearHeatmapData.yAxis}
          cols={clearHeatmapData.xAxis.map((_, i) => i)}
          colLabel={(colIndex) => clearHeatmapData.xAxis[colIndex]}
          valueLabel={(val) => `${val} events`}
        />
      </div>

      <Card>
        <CardHeader title="Clear Events Report" subtitle="Enterprise tabular record of resolution data" />
        <div className="p-1">
          <DataTable<AnomalyRecord> data={filteredEvents} columns={tableColumns} rowKey={(r) => r.id} minWidth="100%" density={density} />
        </div>
      </Card>
    </div>
  );
};
