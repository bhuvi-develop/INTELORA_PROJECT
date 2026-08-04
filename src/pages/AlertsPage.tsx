import { useState, useMemo } from 'react';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, Search, Filter } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/data/DataTable';
import { usePlatformAlerts } from '@/engine/alertStore';
import type { PlatformAlert } from '@/types/alerts';
import { formatTime } from '@/utils/format';

const SeverityIcon = ({ severity }: { severity: string }) => {
  switch (severity) {
    case 'Critical': return <ShieldAlert className="h-4 w-4 text-rose-500" />;
    case 'High': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'Medium': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case 'Low': return <AlertCircle className="h-4 w-4 text-sky-400" />;
    default: return <Info className="h-4 w-4 text-slate-400" />;
  }
};

const SeverityBadge = ({ severity }: { severity: string }) => {
  return (
    <div className="flex items-center gap-1.5">
      <SeverityIcon severity={severity} />
      <span className={`text-xs font-medium ${
        severity === 'Critical' ? 'text-rose-500' :
        severity === 'High' ? 'text-amber-500' :
        severity === 'Medium' ? 'text-amber-400' :
        'text-fg-soft'
      }`}>{severity}</span>
    </div>
  );
};

export const AlertsPage = () => {
  const alerts = usePlatformAlerts();
  
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('All');

  const filteredAlerts = useMemo(() => {
    let res = alerts;
    if (moduleFilter !== 'All') {
      res = res.filter(a => a.module === moduleFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(a => 
        a.title.toLowerCase().includes(s) || 
        a.deviceId.toLowerCase().includes(s) || 
        a.deviceName.toLowerCase().includes(s) ||
        a.description.toLowerCase().includes(s)
      );
    }
    return res;
  }, [alerts, search, moduleFilter]);

  const modules = ['All', ...Array.from(new Set(alerts.map(a => a.module)))];

  const columns = [
    {
      header: 'Time',
      accessorKey: 'timestamp',
      cell: (info: any) => <span className="font-mono text-xs text-fg-soft">{formatTime(info.getValue())}</span>,
    },
    {
      header: 'Severity',
      accessorKey: 'severity',
      cell: (info: any) => <SeverityBadge severity={info.getValue()} />,
    },
    {
      header: 'Module',
      accessorKey: 'module',
      cell: (info: any) => (
        <Badge tone="neutral" className="font-mono text-xs">{info.getValue()}</Badge>
      ),
    },
    {
      header: 'Device',
      accessorKey: 'deviceId',
      cell: (info: any) => {
        const row = info.row.original as PlatformAlert;
        return (
          <div>
            <div className="font-medium text-sm text-fg">{row.deviceName}</div>
            <div className="font-mono text-xs text-fg-muted">{row.deviceId}</div>
          </div>
        );
      }
    },
    {
      header: 'Alert Details',
      accessorKey: 'title',
      cell: (info: any) => {
        const row = info.row.original as PlatformAlert;
        return (
          <div>
            <div className="font-medium text-sm text-fg">{row.title}</div>
            <div className="text-xs text-fg-soft truncate max-w-md">{row.description}</div>
          </div>
        );
      }
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (info: any) => {
        const status = info.getValue();
        return (
          <Badge tone={status === 'Active' ? 'warning' : 'good'}>{status}</Badge>
        );
      }
    }
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Alerts"
        subtitle="Platform alerts and notifications"
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
            <input 
              type="text"
              placeholder="Search alerts by device, title, or description..."
              className="w-full bg-surface-alt border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 transition-shadow"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-fg-muted" />
            <select 
              className="bg-surface-alt border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
            >
              {modules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <Card className="overflow-hidden">
          <DataTable
            columns={columns as any}
            data={filteredAlerts}
            rowKey={(r: any) => r.id}
          />
        </Card>

      </div>
    </div>
  );
};
