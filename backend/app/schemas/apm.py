from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class CriticalityScore(BaseModel):
    asset_id: str
    business_impact: str
    downtime_cost_per_hour: float
    criticality_rank: int

class ReliabilityMetrics(BaseModel):
    asset_id: str
    mtbf_hours: float
    mttr_hours: float
    failure_rate_percentage: float

class WorkOrder(BaseModel):
    order_id: str
    asset_id: str
    title: str
    status: str
    priority: str
    created_at: datetime
    scheduled_for: Optional[datetime]
    cost_estimate: float
    
class CostLedger(BaseModel):
    asset_id: str
    maintenance_cost_ytd: float
    roi_percentage: float
