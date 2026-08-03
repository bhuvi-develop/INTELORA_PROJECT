import { get } from './http';

export interface WorkOrder {
  order_id: string;
  asset_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  scheduled_for: string | null;
  cost_estimate: number;
}

export interface ReliabilityMetrics {
  asset_id: string;
  mtbf_hours: number;
  mttr_hours: number;
  failure_rate_percentage: number;
}

export interface CriticalityScore {
  asset_id: string;
  business_impact: string;
  downtime_cost_per_hour: number;
  criticality_rank: number;
}

export const apmService = {
  getWorkOrders: (assetId?: string) => {
    return get<WorkOrder[]>('/apm/work-orders', assetId ? { asset_id: assetId } : {});
  },
  getReliability: (assetIds: string[]) => {
    return get<ReliabilityMetrics[]>('/apm/reliability', { asset_ids: assetIds.join(',') });
  },
  getCriticality: (assetIds: string[]) => {
    return get<CriticalityScore[]>('/apm/criticality', { asset_ids: assetIds.join(',') });
  }
};
