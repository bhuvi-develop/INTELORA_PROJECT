import {
  Activity,
  Archive,
  CalendarCheck,
  ClipboardList,
  Cog,
  Gauge,
  LayoutDashboard,
  MonitorSmartphone,
  Radio,
  ShieldAlert,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

export interface NavItem {
  key: string;
  label: string;
  short: string;
  description: string;
  to: string;
  icon: LucideIcon;
  /** Which live counter, if any, is badged against this item. */
  badgeKey?: 'anomalies' | 'critical' | 'tasks';
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'monitor',
    label: 'Monitoring',
    items: [
      {
        key: 'cockpit',
        label: 'Enterprise Cockpit',
        short: 'Cockpit',
        description: 'Executive command centre: health, risk, energy and AI intelligence',
        to: PATHS.cockpit,
        icon: LayoutDashboard,
      },
      {
        key: 'devices',
        label: 'Devices',
        short: 'Devices',
        description: 'Asset register across every connected device',
        to: PATHS.devices,
        icon: MonitorSmartphone,
      },
      {
        key: 'telemetry',
        label: 'Live Telemetry',
        short: 'Telemetry',
        description: 'Streaming voltage, current, power, energy and temperature',
        to: PATHS.telemetry,
        icon: Radio,
      },
    ],
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    items: [
      {
        key: 'anomaly',
        label: 'Anomaly Detection',
        short: 'Anomalies',
        description: 'Threshold breaches raised from the live stream',
        to: PATHS.anomaly,
        icon: ShieldAlert,
        badgeKey: 'anomalies',
      },
      {
        key: 'predictive',
        label: 'Predictive Maintenance',
        short: 'Predictive',
        description: 'Failure probability, remaining useful life and confidence',
        to: PATHS.predictive,
        icon: Waypoints,
        badgeKey: 'critical',
      },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    items: [
      {
        key: 'preventive',
        label: 'Preventive Maintenance',
        short: 'Preventive',
        description: 'Scheduled task calendar with priority and completion',
        to: PATHS.preventive,
        icon: CalendarCheck,
        badgeKey: 'tasks',
      },
      {
        key: 'prescriptive',
        label: 'Prescriptive Maintenance',
        short: 'Prescriptive',
        description: 'Recommended business action per device condition',
        to: PATHS.prescriptive,
        icon: ClipboardList,
      },
    ],
  },
  {
    key: 'performance',
    label: 'Performance',
    items: [
      {
        key: 'apm',
        label: 'Asset Performance',
        short: 'APM',
        description: 'Fleet health ranking, availability and performance score',
        to: PATHS.apm,
        icon: Activity,
      },
      {
        key: 'oee',
        label: 'Equipment Effectiveness',
        short: 'OEE',
        description: 'Availability × performance × quality with trend',
        to: PATHS.oee,
        icon: Gauge,
      },
    ],
  },
  {
    key: 'records',
    label: 'Records',
    items: [
      {
        key: 'reports',
        label: 'Historical Reports',
        short: 'Reports',
        description: 'Archived telemetry, anomalies, predictions and tasks',
        to: PATHS.reports,
        icon: Archive,
      },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    items: [
      {
        key: 'settings',
        label: 'Settings',
        short: 'Settings',
        description: 'Workspace, simulation and integration configuration',
        to: PATHS.settings,
        icon: Cog,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export const navItemByPath = (pathname: string): NavItem | undefined => {
  // Longest match wins so /app/devices/LAP-001 resolves to Devices, not Overview.
  const matches = NAV_ITEMS.filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  return matches.sort((a, b) => b.to.length - a.to.length)[0];
};

export const MODULE_TITLES: Record<string, { title: string; subtitle: string }> = {
  cockpit: {
    title: 'Enterprise Cockpit',
    subtitle: 'Operational command and intelligence centre for the connected estate',
  },
  devices: {
    title: 'Devices',
    subtitle: 'Every registered asset with its category, brand, model and connectivity state',
  },
  telemetry: {
    title: 'Live Telemetry',
    subtitle: 'Streaming electrical and thermal channels, refreshed every five seconds',
  },
  anomaly: {
    title: 'Anomaly Detection',
    subtitle: 'Threshold breaches raised from the live stream with severity and disposition',
  },
  predictive: {
    title: 'Predictive Maintenance',
    subtitle: 'Component failure probability, remaining useful life and model confidence',
  },
  preventive: {
    title: 'Preventive Maintenance',
    subtitle: 'Scheduled maintenance tasks with due date, priority and completion state',
  },
  prescriptive: {
    title: 'Prescriptive Maintenance',
    subtitle: 'The recommended action for each device, driven by its current condition',
  },
  apm: {
    title: 'Asset Performance Management',
    subtitle: 'Fleet comparison: health ranking, availability and performance score',
  },
  oee: {
    title: 'Overall Equipment Effectiveness',
    subtitle: 'Availability, performance and quality with fleet trend',
  },
  reports: {
    title: 'Historical Reports',
    subtitle: 'Archived records exportable to PDF, Excel and CSV',
  },
  settings: {
    title: 'Platform Settings',
    subtitle: 'Workspace preferences, simulation control and integration configuration',
  },
};
