import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Activity, Search, AlertTriangle, Download, Filter } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { PATHS } from '@/routes/paths';
import { SERIES } from '@/config/viz';
import { SEVERITY_TONE } from '@/engine/derive';
import { formatDateTime } from '@/utils/format';
import { useToast, useUI } from '@/hooks';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader } from '@/components/ui/Card';
import { AreaTrend, BarTrend, DonutSplit, Heatmap, LineTrend } from '@/components/charts';
import { DataTable } from '@/components/data';
import { PageHeader, SeverityBadge, DeviceIdentity } from '@/components/common';
import { sortBySeverity } from '@/engine/analytics';

const BUCKETS = 24;
const BUCKET_MS = 120_000;
const minuteFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const NOW = Date.now();
const STATIC_EVENTS = (Array.from({ length: 45 }).map((_, i) => ({
  id: `evt-${i}`,
  assetId: `LAP-${String((i % 8) + 1).padStart(3, '0')}`,
  assetName: 'Asset',
  category: 'Hardware',
  type: ['Overheating', 'Voltage Drop', 'Latency Spike', 'Connection Loss'][i % 4],
  code: `RUL-00${(i % 5) + 1}`,
  severity: (['Critical', 'Major', 'Warning', 'Info'] as const)[i % 4],
  observed: 100 + Math.random() * 50,
  threshold: 100,
  unit: 'U',
  status: 'Active',
  timestamp: NOW - Math.random() * BUCKETS * BUCKET_MS,
  resolvedAt: null,
})) as unknown) as AnomalyRecord[];

export const EventLifecyclePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const journal = STATIC_EVENTS;
  const at = NOW;

  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('24h');

  // Filter scoped to Active Events as requested by drill-down context
  const activeEvents = useMemo(() => journal.filter((j) => j.status === 'Active'), [journal]);

  // Derived timeline buckets
  const timeline = useMemo(() => {
    const out = [];
    for (let index = BUCKETS - 1; index >= 0; index -= 1) {
      const to = at - index * BUCKET_MS;
      const from = to - BUCKET_MS;
      const bucketEvents = activeEvents.filter((r) => r.timestamp > from && r.timestamp <= to);
      
      out.push({
        label: minuteFmt.format(new Date(to)),
        total: bucketEvents.length,
        rate: bucketEvents.length / 2, // Events per minute
        critical: bucketEvents.filter(r => r.severity === 'Critical').length,
        major: bucketEvents.filter(r => r.severity === 'Major').length,
        warning: bucketEvents.filter(r => r.severity === 'Warning').length,
        info: bucketEvents.filter(r => r.severity === 'Info').length,
      });
    }
    return out;
  }, [activeEvents, at]);

  // Aggregated distributions
  const severityDistribution = useMemo(() => {
    const counts = { Critical: 0, Major: 0, Warning: 0, Info: 0 };
    activeEvents.forEach(e => { counts[e.severity]++; });
    return [
      { label: 'Critical', value: counts.Critical, color: SEVERITY_TONE.Critical.color },
      { label: 'Major', value: counts.Major, color: SEVERITY_TONE.Major.color },
      { label: 'Warning', value: counts.Warning, color: SEVERITY_TONE.Warning.color },
      { label: 'Info', value: counts.Info, color: SEVERITY_TONE.Info.color },
    ].filter(i => i.value > 0);
  }, [activeEvents]);

  const deviceDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEvents.forEach(e => { counts[e.assetId] = (counts[e.assetId] || 0) + 1; });
    return Object.entries(counts).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [activeEvents]);

  const failureModeDistribution = useMemo(() => {
    const counts: Record<string, { Critical: number, Major: number, Warning: number, Info: number }> = {};
    activeEvents.forEach(e => { 
      const mode = e.type || 'unknown';
      if (!counts[mode]) counts[mode] = { Critical: 0, Major: 0, Warning: 0, Info: 0 };
      counts[mode][e.severity]++; 
    });
    return Object.entries(counts).map(([mode, sv]) => ({ mode, ...sv })).sort((a, b) => (b.Critical + b.Major) - (a.Critical + a.Major)).slice(0, 8);
  }, [activeEvents]);

  const hourlyDistribution = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      events: Math.floor(Math.random() * 20) + (activeEvents.length > 0 ? 5 : 0),
    }));
  }, [activeEvents]);

  const topRules = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEvents.forEach(e => { counts[e.code] = (counts[e.code] || 0) + 1; });
    return Object.entries(counts).map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [activeEvents]);

  const deviceHeatmapData = useMemo(() => {
    const yAxis = Array.from(new Set(activeEvents.map(e => e.assetId))).slice(0, 8);
    const xAxis = timeline.map(t => t.label).slice(-10);
    const data = yAxis.map(() => xAxis.map(() => ({ value: Math.floor(Math.random() * 5) })));
    return { xAxis, yAxis, data };
  }, [activeEvents, timeline]);

  const tableColumns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(() => [
    { id: 'time', header: 'Time', accessorFn: row => row.timestamp, cell: (info: any) => formatDateTime(info.row.original.timestamp), meta: { width: '10rem' } },
    { id: 'device', header: 'Device', accessorFn: row => row.assetId, cell: (info: any) => <DeviceIdentity assetId={info.row.original.assetId} assetName={info.row.original.assetName} meta={info.row.original.category} idOnly /> },
    { id: 'severity', header: 'Severity', accessorFn: row => row.severity, cell: (info: any) => <SeverityBadge severity={info.row.original.severity} size="xs" /> },
    { id: 'rule', header: 'Rule', accessorFn: row => row.code, cell: (info: any) => <span className="font-mono text-[11px]">{info.row.original.code}</span> },
    { id: 'observed', header: 'Observed', accessorFn: row => row.observed, cell: (info: any) => <span className="tabular-nums">{info.row.original.observed.toFixed(2)}</span>, meta: { align: 'right' } },
    { id: 'threshold', header: 'Threshold', accessorFn: row => row.threshold, cell: (info: any) => <span className="tabular-nums">{info.row.original.threshold.toFixed(2)}</span>, meta: { align: 'right' } },
    { id: 'status', header: 'Status', accessorFn: row => row.status, cell: (info: any) => <Badge tone="warning" size="xs">{info.row.original.status}</Badge> },
  ], []);

  const filteredEvents = useMemo(() => {
    return activeEvents
      .filter(e => e.assetId.toLowerCase().includes(search.toLowerCase()) || e.code.toLowerCase().includes(search.toLowerCase()))
      .sort(sortBySeverity);
  }, [activeEvents, search]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Button variant="ghost" size="sm" icon={ArrowLeft} className="mb-3 -ml-1" onClick={() => navigate(PATHS.anomalyActiveEvents)}>
          Back to Active Events
        </Button>
        <PageHeader 
          title="Event Lifecycle Analytics" 
          subtitle="Detailed, isolated timelines and distributions for all active events"
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
        <Select options={[{value: 'all', label: 'All Failure Modes'}]} value="all" onChange={() => {}} />
      </div>

      {/* Timelines (Individual) */}
      <div className="grid gap-4 xl:grid-cols-2">
        <LineTrend title="Critical Events Timeline" subtitle="Frequency of Critical events over time" icon={Activity} data={timeline} series={[{ key: 'critical', name: 'Critical', color: SEVERITY_TONE.Critical.color, decimals: 0 }]} height={260} />
        <LineTrend title="Major Events Timeline" subtitle="Frequency of Major events over time" icon={Activity} data={timeline} series={[{ key: 'major', name: 'Major', color: SEVERITY_TONE.Major.color, decimals: 0 }]} height={260} />
        <LineTrend title="Warning Events Timeline" subtitle="Frequency of Warning events over time" icon={Activity} data={timeline} series={[{ key: 'warning', name: 'Warning', color: SEVERITY_TONE.Warning.color, decimals: 0 }]} height={260} />
        <LineTrend title="Info Events Timeline" subtitle="Frequency of Info events over time" icon={Activity} data={timeline} series={[{ key: 'info', name: 'Info', color: SEVERITY_TONE.Info.color, decimals: 0 }]} height={260} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AreaTrend title="Total Events Timeline" subtitle="Cumulative sum of all active events" icon={Activity} data={timeline} series={[{ key: 'total', name: 'Total Events', color: SERIES[0], decimals: 0 }]} height={300} />
        <LineTrend title="Event Rate Per Minute" subtitle="Throughput velocity of raised events" icon={Activity} data={timeline} series={[{ key: 'rate', name: 'Events/Min', color: SERIES[2], decimals: 1 }]} height={300} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
           <BarTrend title="Events by Failure Mode" subtitle="Severity breakdown per detected mode" icon={AlertTriangle} data={failureModeDistribution} series={[
            { key: 'Critical', name: 'Critical', color: SEVERITY_TONE.Critical.color, decimals: 0 },
            { key: 'Major', name: 'Major', color: SEVERITY_TONE.Major.color, decimals: 0 },
            { key: 'Warning', name: 'Warning', color: SEVERITY_TONE.Warning.color, decimals: 0 },
            { key: 'Info', name: 'Info', color: SEVERITY_TONE.Info.color, decimals: 0 },
          ]} height={320} categoryWidth={80} />
        </div>
        <div>
          <DonutSplit 
            title="Events by Severity" 
            subtitle="Proportional severity makeup" 
            data={severityDistribution.map(s => ({ key: s.label, name: s.label, value: s.value, color: s.color }))} 
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend title="Events by Device" subtitle="Highest generating assets" icon={Activity} data={deviceDistribution} series={[{ key: 'count', name: 'Events', color: SERIES[1], decimals: 0 }]} layout="horizontal" height={320} categoryWidth={120} />
        <BarTrend title="Top Triggered Rules" subtitle="Most frequently tripped thresholds" icon={Activity} data={topRules} series={[{ key: 'count', name: 'Events', color: SERIES[3], decimals: 0 }]} layout="horizontal" height={320} categoryWidth={120} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend title="Hourly Distribution" subtitle="Active events aggregated by hour" icon={Activity} data={hourlyDistribution} series={[{ key: 'events', name: 'Events', color: SERIES[4], decimals: 0 }]} height={320} categoryWidth={60} />
        <Heatmap 
          title="Device-wise Timeline" 
          subtitle="Concentration of events by asset over time" 
          cells={deviceHeatmapData.yAxis.flatMap((row, y) => deviceHeatmapData.xAxis.map((_col, x) => ({ row, col: x, value: deviceHeatmapData.data[y][x].value })))} 
          rows={deviceHeatmapData.yAxis}
          cols={deviceHeatmapData.xAxis.map((_, i) => i)}
          colLabel={(colIndex) => deviceHeatmapData.xAxis[colIndex]}
          valueLabel={(val) => `${val} events`}
        />
      </div>

      <Card>
        <CardHeader title="Recent Timeline Report" subtitle="Enterprise tabular record of all timeline events" />
        <div className="p-1">
          <DataTable<AnomalyRecord> data={filteredEvents} columns={tableColumns} rowKey={(r) => r.id} minWidth="100%" density={density} />
        </div>
      </Card>
    </div>
  );
};
