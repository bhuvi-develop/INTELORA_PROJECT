from app.schemas.apm import CriticalityScore, ReliabilityMetrics, WorkOrder, CostLedger
from datetime import datetime
import random

class ApmEngine:
    def get_criticality(self, asset_ids: list[str]) -> list[CriticalityScore]:
        return [
            CriticalityScore(
                asset_id=aid,
                business_impact="High" if random.random() > 0.5 else "Medium",
                downtime_cost_per_hour=random.uniform(100.0, 1000.0),
                criticality_rank=random.randint(1, 10)
            ) for aid in asset_ids
        ]

    def get_reliability_metrics(self, asset_ids: list[str]) -> list[ReliabilityMetrics]:
        return [
            ReliabilityMetrics(
                asset_id=aid,
                mtbf_hours=random.uniform(500, 5000),
                mttr_hours=random.uniform(2, 48),
                failure_rate_percentage=random.uniform(0.1, 5.0)
            ) for aid in asset_ids
        ]

    def get_work_orders(self, asset_id: str = None) -> list[WorkOrder]:
        orders = [
            WorkOrder(
                order_id=f"WO-{random.randint(1000,9999)}",
                asset_id=asset_id or "UNKNOWN",
                title="Preventive Maintenance",
                status="Scheduled",
                priority="High",
                created_at=datetime.utcnow(),
                scheduled_for=None,
                cost_estimate=250.0
            )
        ]
        return orders
