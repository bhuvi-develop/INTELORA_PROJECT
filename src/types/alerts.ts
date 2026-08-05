export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved' | 'Cleared';

export interface PlatformAlert {
  id: string;
  timestamp: number;
  module: string;
  type: string;
  severity: AlertSeverity;
  deviceId: string;
  deviceName: string;
  equipmentType: string;
  title: string;
  description: string;
  status: AlertStatus;
  recommendedAction?: string;
  raw?: any;
}
