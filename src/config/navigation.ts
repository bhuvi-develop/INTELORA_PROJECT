import {
  Activity,
  Brain,
  Cog,
  Factory,
  Gauge,
  LayoutDashboard,
  Bell,
  FileText,
  MonitorSmartphone,
  Radio,
  CalendarCheck,
  ClipboardList,
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

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'cockpit',
    label: 'Enterprise Cockpit',
    short: 'Cockpit',
    description: 'Executive command centre: health, risk, energy and AI intelligence',
    to: PATHS.cockpit,
    icon: LayoutDashboard,
  },
  {
    key: 'anomaly',
    label: 'AI Anomaly Detection',
    short: 'Anomalies',
    description: 'Threshold breaches raised from the live stream',
    to: PATHS.anomaly,
    icon: Activity,
    badgeKey: 'anomalies',
  },
  {
    key: 'predictive',
    label: 'Predictive Maintenance',
    short: 'Predictive',
    description: 'Failure probability, remaining useful life and confidence',
    to: PATHS.predictive,
    icon: Brain,
    badgeKey: 'critical',
  },
  {
    key: 'oee',
    label: 'Overall Equipment Efficiency',
    short: 'OEE',
    description: 'Availability × performance × quality with trend',
    to: PATHS.oee,
    icon: Gauge,
  },
  {
    key: 'apm',
    label: 'Asset Performance Management',
    short: 'APM',
    description: 'Fleet health ranking, availability and performance score',
    to: PATHS.apm,
    icon: Factory,
  },
  {
    key: 'alerts',
    label: 'Alerts',
    short: 'Alerts',
    description: 'Platform alerts and notifications',
    to: PATHS.anomaly, // Maps to anomaly route
    icon: Bell,
  },
  {
    key: 'reports',
    label: 'Historical Reports',
    short: 'Reports',
    description: 'Archived records and historical telemetry',
    to: PATHS.reports,
    icon: FileText,
  },
  {
    key: 'settings',
    label: 'Settings',
    short: 'Settings',
    description: 'Workspace, simulation and integration configuration',
    to: PATHS.settings,
    icon: Cog,
  },
  // Hidden routes (still registered in NAV_ITEMS for internal resolution but not in PRIMARY_NAV)
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
    description: 'Streaming electrical and thermal channels',
    to: PATHS.telemetry,
    icon: Radio,
  },
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
  }
];

/**
 * The sidebar.
 *
 * A flat list of modules with no category headings above them. Grouping seven
 * destinations under five labels adds a row of chrome for every two rows of
 * navigation, and an operator who works here daily learns the list, not the
 * taxonomy.
 *
 * Devices, Live Telemetry, Preventive and Prescriptive Maintenance are not
 * listed. Their routes are unchanged and they remain reachable from the command
 * palette and from the modules that link to them.
 */
export const PRIMARY_NAV_KEYS = [
  'cockpit',
  'anomaly',
  'predictive',
  'oee',
  'apm',
  'alerts',
  'reports',
  'settings',
] as const;

export const PRIMARY_NAV: NavItem[] = PRIMARY_NAV_KEYS.map(
  (key) => NAV_ITEMS.find((item) => item.key === key)!,
).filter(Boolean);

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
