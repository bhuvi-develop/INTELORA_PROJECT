import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Gauge, Server, Clock, Database, BarChart3, TrendingUp, MonitorPlay, History, Bell } from 'lucide-react';
import { HubCard } from '@/components/predictive/HubCard';
import { ExecutiveOverviewPanel } from '@/components/oee/ExecutiveOverviewPanel';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { IconButton, Button } from '@/components/ui/Button';
import type { WorkspaceDef } from '@/components/predictive/navigation';
import { useSnapshot } from '@/engine/store';
import { formatPercent } from '@/utils/format';
import { useToast } from '@/hooks';

export const OEE_WORKSPACES: WorkspaceDef[] = [
  { id: 'fleet' as any, label: 'Fleet Intelligence', discipline: 'Asset Health', icon: Activity, question: 'How is the fleet performing?', summary: 'Fleet health score' },
  { id: 'analytics' as any, label: 'OEE Analytics', discipline: 'Deep Dive', icon: BarChart3, question: 'What are the core metrics?', summary: 'Availability, Performance, Quality' },
  { id: 'devices' as any, label: 'Device Intelligence', discipline: 'Individual Assets', icon: MonitorPlay, question: 'How are devices operating?', summary: 'Per-device OEE' },
  { id: 'sessions' as any, label: 'Session Intelligence', discipline: 'Time Series', icon: History, question: 'What happened during sessions?', summary: 'Session logs' },
  { id: 'fleetHealth' as any, label: 'Fleet Health', discipline: 'Fleet Condition', icon: TrendingUp, question: 'Is the fleet healthy?', summary: 'Fleet Health Workspace' },
];

export const OeeHub = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { oee, kpis } = useSnapshot();
  const [showNotifications, setShowNotifications] = useState(false);
  
  const toast = useToast();
  
  // Notification states for the 4 core modules requested
  const [alerts, setAlerts] = useState({
    anomaly: true,
    pdm: false,
    apm: true,
    oee: true,
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      
      {/* Hero */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 w-full rounded-2xl bg-gradient-to-br from-brand-900/40 to-brand-900/10 border border-brand-500/20 p-6 flex flex-col sm:flex-row items-center gap-6 shadow-xl"
      >
        <div className="p-4 bg-brand-500/20 rounded-full border border-brand-400/30 flex-shrink-0">
          <Gauge className="text-brand-300 w-10 h-10" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-fg tracking-tight">OEE Engine Active</h2>
          <p className="text-sm text-brand-100/70 mt-1">
            Analyzing operational efficiency across the entire fleet in real-time. Projecting availability, performance, and quality metrics.
          </p>
        </div>
        <div className="flex gap-8 text-right shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-brand-200/60 font-semibold mb-1">Overall OEE</div>
            <div className="text-2xl font-bold text-brand-300 tabular-nums">
              {formatPercent(oee.oee, 1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-brand-200/60 font-semibold mb-1">Target</div>
            <div className="text-2xl font-bold text-fg tabular-nums">85.0%</div>
          </div>
          <div className="ml-4 pl-4 border-l border-brand-500/20 flex items-center">
            <IconButton 
               icon={Bell} 
               label="Notification Settings" 
               className="text-brand-300 hover:bg-brand-500/20 relative"
               onClick={() => setShowNotifications(true)}
            />
            <div className="absolute top-1/2 right-4 -translate-y-4 h-2 w-2 rounded-full bg-rose-500"></div>
          </div>
        </div>
      </motion.div>

      {/* Embedded Executive Overview Content */}
      <div className="mb-8">
        <ExecutiveOverviewPanel />
      </div>

      {/* Grid */}
      <h3 className="text-sm font-semibold tracking-wide text-fg mb-4">Explore Workspaces</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1 content-start pb-8">
        {OEE_WORKSPACES.map((workspace, index) => (
          <motion.div
            key={workspace.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <HubCard
              workspace={workspace}
              metric={
                (workspace.id as string) === 'fleetHealth' ? formatPercent(kpis.averageHealth, 1) :
                (workspace.id as string) === 'analytics' ? formatPercent(oee.availability, 1) :
                String(kpis.totalAssets)
              }

              metricUnit={workspace.id === 'analytics' ? 'avail' : 'active'}
              supportingMetrics={[]}
              status="TRACKING"
              statusKind="normal"
              onOpen={() => onOpen(workspace.id as string)}
            />
          </motion.div>
        ))}
      </div>
      
      {/* ── Bottom Platform Status Bar ─────────────────────────────────── */}
      <div className="mt-auto border-t border-overlay/[0.08] bg-background/80 backdrop-blur-md px-6 py-2.5 flex items-center justify-between text-[11px] font-medium text-fg-muted rounded-t-xl">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Activity className="text-emerald-400 w-3.5 h-3.5" />
            OEE Engine: Online
          </span>
          <span className="flex items-center gap-2">
            <Server className="text-emerald-400 w-3.5 h-3.5" />
            WebSocket: Connected
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Last Update: Live
          </span>
          <span className="flex items-center gap-2">
            <Database className="text-emerald-400 w-3.5 h-3.5" />
            Backend Health: OK
          </span>
        </div>
      </div>

      <Modal
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Platform Intelligence Alerts"
        subtitle="Enable cross-module notifications for core analytical engines."
        size="sm"
        footer={
          <Button onClick={() => {
            setShowNotifications(false);
            const enabledCount = Object.values(alerts).filter(Boolean).length;
            toast.success('Alert Preferences Saved', `Successfully configured ${enabledCount} notification streams for Anomaly, PDM, APM, and OEE.`);
          }}>
            Save Preferences
          </Button>
        }
      >
        <div className="space-y-6">
          <Switch
            label="AI Anomaly Detection"
            description="Receive real-time notifications for critical threshold breaches and unusual telemetry spikes."
            checked={alerts.anomaly}
            onChange={(c) => setAlerts(prev => ({ ...prev, anomaly: c }))}
          />
          <Switch
            label="Predictive Maintenance (PDM)"
            description="Notify me when component degradation signals impending failure within the next 7 days."
            checked={alerts.pdm}
            onChange={(c) => setAlerts(prev => ({ ...prev, pdm: c }))}
          />
          <Switch
            label="Asset Performance Manager (APM)"
            description="Send alerts for overall asset lifecycle risks and critical ROI warnings."
            checked={alerts.apm}
            onChange={(c) => setAlerts(prev => ({ ...prev, apm: c }))}
          />
          <Switch
            label="Overall Equipment Efficiency (OEE)"
            description="Alert me immediately when fleet or device OEE drops below the 85.0% target."
            checked={alerts.oee}
            onChange={(c) => setAlerts(prev => ({ ...prev, oee: c }))}
          />
        </div>
      </Modal>
    </div>
  );
};
