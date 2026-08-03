"""The running platform.

One object owns the simulation, the detector, the models and the derived state,
and everything else — routers, background tasks, the websocket — reads from it.
Keeping a single owner is what makes cross-module agreement structural: the
dashboard, the anomaly APIs and the maintenance APIs are three projections of one
snapshot, so they cannot report different health for the same device.

Readings are produced every tick. The heavier derived state — predictions,
effectiveness, insights — is recomputed on a slower cadence and cached, because
re-fitting a regression for twenty-four devices every second would burn CPU to
produce a number that moves in the fourth decimal place.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.logging_config import get_logger
from app.ml.anomaly_model import AnomalyScorer
from app.ml.degradation_model import ML_BACKEND, DegradationModel
from app.services.anomaly_service import AnomalyDetector, AnomalyEvent
from app.services.derive import (
    SEVERITY_RANK,
    asset_wear,
    band_of,
    operational_health_score,
    prescriptive_for,
)
from app.services.performance_service import PerformanceResult, PerformanceService
from app.services.predictive_service import AssetPrediction, PredictiveService
from app.services.simulator import MikosSimulator, Reading

logger = get_logger(__name__)


@dataclass
class StepResult:
    readings: list[Reading]
    events: list[AnomalyEvent]
    tick: int
    at: datetime


@dataclass
class Analytics:
    """Derived state, recomputed on the analytics cadence."""

    computed_at: datetime
    #: Tick this state was computed from. Published alongside the current tick
    #: so a caller can tell how old the expensive figures in a response are.
    tick: int = 0
    predictions: dict[str, AssetPrediction] = field(default_factory=dict)
    performance: dict[str, PerformanceResult] = field(default_factory=dict)
    fleet_oee: dict = field(default_factory=dict)
    kpis: dict = field(default_factory=dict)
    categories: list[dict] = field(default_factory=list)
    ranking: list[dict] = field(default_factory=list)


class InteloraEngine:
    def __init__(self) -> None:
        self.simulator = MikosSimulator()
        self.scorer = AnomalyScorer()
        self.degradation = DegradationModel()
        self.detector = AnomalyDetector(self.scorer)
        self.predictive = PredictiveService(self.degradation)
        self.performance = PerformanceService()

        self.tick: int = 0
        self.started_at: datetime = datetime.now(timezone.utc)
        self.last_tick_at: datetime = self.started_at
        self.running: bool = False
        self.history_backfilled: bool = False

        self._analytics: Analytics = Analytics(computed_at=self.started_at)
        self._lock = threading.RLock()

    def register_asset(self, seed: AssetSeed) -> AssetState:
        """Commission a new asset into the running simulation and recalculate analytics."""
        with self._lock:
            state = self.simulator.add_asset(seed)
            self.refresh_analytics()
            return state

    # ── Simulation ──────────────────────────────────────────────────────

    def step(self, dt: float | None = None, *, now: datetime | None = None) -> StepResult:
        """Advance the estate by one tick and judge every reading it produced."""
        interval = settings.tick_interval_seconds if dt is None else dt

        with self._lock:
            self.tick += 1
            readings = self.simulator.step(interval)

            events: list[AnomalyEvent] = []
            for reading in readings:
                state = self.simulator.states[reading.asset_id]
                events.extend(self.detector.evaluate(state, reading, interval))

            self.last_tick_at = now or datetime.now(timezone.utc)
            return StepResult(readings=readings, events=events, tick=self.tick, at=self.last_tick_at)

    def fit_models(self) -> int:
        """Refit both models for every asset that has accumulated enough history."""
        fitted = 0
        with self._lock:
            for asset_id, state in self.simulator.states.items():
                window = list(state.history)
                if self.scorer.maybe_fit(asset_id, window):
                    fitted += 1
                self.predictive.refresh_fit(state)
        if fitted:
            logger.info("refitted anomaly models for %d assets (%s)", fitted, ML_BACKEND)
        return fitted

    # ── Derived state ───────────────────────────────────────────────────

    def refresh_analytics(self, now: datetime | None = None) -> Analytics:
        """Recompute predictions, effectiveness and the estate roll-ups."""
        stamp = now or datetime.now(timezone.utc)

        with self._lock:
            predictions: dict[str, AssetPrediction] = {}
            performance: dict[str, PerformanceResult] = {}

            for asset_id, state in self.simulator.states.items():
                prediction = self.predictive.predict(state, stamp)
                predictions[asset_id] = prediction

                open_events = self.detector.active_by_asset(asset_id)
                critical_open = sum(1 for event in open_events if event.severity == "Critical")
                resolved = [
                    event.minutes_open(stamp)
                    for event in self.detector.journal
                    if event.asset_id == asset_id and event.resolved_at is not None
                ]

                performance[asset_id] = self.performance.compute(
                    state=state,
                    anomalies_24h=self.detector.count_last_24h(asset_id, stamp),
                    active_critical=critical_open,
                    resolved_durations_minutes=resolved,
                    failure_probability=prediction.primary.failure_probability,
                )

            results = list(performance.values())
            fleet = self.performance.fleet_oee(results)

            analytics = Analytics(
                computed_at=stamp,
                tick=self.tick,
                predictions=predictions,
                performance=performance,
                fleet_oee=fleet,
                kpis=self._build_kpis(results, predictions, stamp),
                categories=self.performance.category_rollup(results),
                ranking=self.performance.ranking(results),
            )
            self._analytics = analytics
            return analytics

    def live_kpis(self) -> dict:
        """The KPI block with its volatile figures brought up to the current tick.

        Predictions and effectiveness are expensive and are cached on the
        analytics cadence. Connectivity, condition and open-alarm counts are
        O(number of devices) and change every second, so publishing the cached
        copy of those would let the dashboard disagree with the anomaly endpoint
        about the same instant — which is precisely what this platform promises
        cannot happen.
        """
        with self._lock:
            kpis = dict(self._analytics.kpis)
            states = list(self.simulator.states.values())
            if not states:
                return kpis

            total = len(states)
            latest = [state.history[-1] for state in states if state.history]
            bands = [band_of(state.health) for state in states]
            open_events = self.detector.open_events()

            mean_health = round(sum(state.health for state in states) / total, 1)
            critical_assets = bands.count("critical")
            critical_open = sum(1 for event in open_events if event.severity == "Critical")

            kpis.update(
                {
                    "total_assets": total,
                    "online_assets": sum(1 for s in states if s.device_status == "Online"),
                    "standby_assets": sum(1 for s in states if s.device_status == "Standby"),
                    "offline_assets": sum(1 for s in states if s.device_status == "Offline"),
                    "average_health": mean_health,
                    "healthy_assets": bands.count("healthy"),
                    "good_assets": bands.count("good"),
                    "warning_assets": bands.count("warning"),
                    "critical_assets": critical_assets,
                    "total_power_w": round(sum(r.active_power for r in latest), 2),
                    "average_power_w": round(sum(r.active_power for r in latest) / total, 2),
                    "total_energy_kwh": round(sum(s.energy_kwh for s in states), 4),
                    "active_anomalies": len(open_events),
                    "critical_anomalies": critical_open,
                    "unacknowledged_alerts": sum(1 for e in open_events if e.status == "Active"),
                    "operational_health": operational_health_score(
                        mean_health,
                        float(kpis.get("average_availability", 0.0)),
                        critical_assets,
                        critical_open,
                        total,
                    ),
                    "computed_at": datetime.now(timezone.utc),
                }
            )
            return kpis

    @property
    def analytics(self) -> Analytics:
        """Cached derived state, computed on demand the first time it is asked for."""
        if not self._analytics.predictions:
            return self.refresh_analytics()
        return self._analytics

    def _build_kpis(
        self,
        results: list[PerformanceResult],
        predictions: dict[str, AssetPrediction],
        stamp: datetime,
    ) -> dict:
        states = list(self.simulator.states.values())
        total = len(states)
        latest = [state.history[-1] for state in states if state.history]

        online = sum(1 for state in states if state.device_status == "Online")
        standby = sum(1 for state in states if state.device_status == "Standby")
        offline = sum(1 for state in states if state.device_status == "Offline")

        bands = [band_of(state.health) for state in states]
        open_events = self.detector.open_events()

        mean_health = round(sum(state.health for state in states) / total, 1) if total else 0.0
        mean_availability = (
            round(sum(entry.availability for entry in results) / len(results), 1) if results else 0.0
        )
        critical_assets = bands.count("critical")
        critical_open = sum(1 for event in open_events if event.severity == "Critical")

        rul_values = [prediction.primary.rul_days for prediction in predictions.values()]

        return {
            "total_assets": total,
            "online_assets": online,
            "standby_assets": standby,
            "offline_assets": offline,
            "average_health": mean_health,
            "healthy_assets": bands.count("healthy"),
            "good_assets": bands.count("good"),
            "warning_assets": bands.count("warning"),
            "critical_assets": critical_assets,
            "total_power_w": round(sum(reading.active_power for reading in latest), 2),
            "average_power_w": round(sum(reading.active_power for reading in latest) / total, 2)
            if total
            else 0.0,
            "total_energy_kwh": round(sum(state.energy_kwh for state in states), 4),
            "active_anomalies": len(open_events),
            "critical_anomalies": critical_open,
            "unacknowledged_alerts": sum(1 for event in open_events if event.status == "Active"),
            "average_availability": mean_availability,
            "average_oee": round(sum(entry.oee for entry in results) / len(results), 1) if results else 0.0,
            "average_rul_days": round(sum(rul_values) / len(rul_values), 1) if rul_values else 0.0,
            "assets_at_risk": sum(
                1 for entry in results if entry.risk_tier in ("critical", "high")
            ),
            "operational_health": operational_health_score(
                mean_health, mean_availability, critical_assets, critical_open, total
            ),
            "computed_at": stamp,
        }

    # ── Projections ─────────────────────────────────────────────────────

    def asset_view(self, asset_id: str) -> dict | None:
        """Everything known about one device, assembled from a single snapshot."""
        state = self.simulator.states.get(asset_id)
        if state is None:
            return None

        analytics = self.analytics
        prediction = analytics.predictions.get(asset_id)
        performance = analytics.performance.get(asset_id)
        reading = state.history[-1] if state.history else None

        prescriptive = prescriptive_for(
            band_of(state.health),
            prediction.primary.component if prediction else "device",
            state.device_status,
            state.temperature_ratio,
        )

        return {
            "asset": {
                "asset_id": state.asset_id,
                "asset_name": state.seed.asset_name,
                "category": state.seed.category,
                "brand": state.seed.brand,
                "model": state.seed.model,
                "status": state.device_status,
            },
            "device_uid": state.device_uid,
            "criticality": state.seed.criticality,
            "health_score": state.health,
            "health_band": band_of(state.health),
            "wear": round(asset_wear(state.wear), 5),
            "load_state": state.load_state,
            "runtime_hours": round(state.runtime_hours, 3),
            "energy_kwh": round(state.energy_kwh, 5),
            "relay_operations": state.relay_operations,
            "latest": reading,
            "components": [
                {
                    "name": spec.name,
                    "wear": round(state.wear[index], 5) if index < len(state.wear) else 0.0,
                    "wear_rate_per_day": round(state.wear_rate[index], 8)
                    if index < len(state.wear_rate)
                    else 0.0,
                    "expected_life_days": spec.expected_life_days,
                }
                for index, spec in enumerate(state.profile.components)
            ],
            "prediction": prediction,
            "performance": performance,
            "prescriptive": prescriptive,
            "open_anomalies": self.detector.active_by_asset(asset_id),
        }

    def risk_distribution(self) -> list[dict]:
        tiers = ["critical", "high", "medium", "low", "healthy"]
        counts = {tier: 0 for tier in tiers}
        for entry in self.analytics.performance.values():
            counts[entry.risk_tier] = counts.get(entry.risk_tier, 0) + 1
        total = max(1, sum(counts.values()))
        return [
            {"tier": tier, "count": counts[tier], "share_pct": round(counts[tier] / total * 100, 1)}
            for tier in tiers
        ]

    def severity_breakdown(self) -> dict[str, int]:
        counts = {"Critical": 0, "Major": 0, "Warning": 0, "Info": 0}
        for event in self.detector.open_events():
            counts[event.severity] = counts.get(event.severity, 0) + 1
        return counts

    def worst_assets(self, limit: int = 5) -> list[dict]:
        entries = sorted(self.analytics.performance.values(), key=lambda entry: entry.health_score)
        return [
            {
                "asset_id": entry.asset_id,
                "asset_name": entry.asset_name,
                "category": entry.category,
                "health_score": entry.health_score,
                "health_band": entry.health_band,
                "risk_tier": entry.risk_tier,
                "oee": entry.oee,
            }
            for entry in entries[:limit]
        ]

    def recent_events(self, limit: int = 20) -> list[AnomalyEvent]:
        return sorted(
            self.detector.journal,
            key=lambda event: (event.detected_at, SEVERITY_RANK.get(event.severity, 0)),
            reverse=True,
        )[:limit]

    # ── Platform state ──────────────────────────────────────────────────

    def platform_health(self, database_ok: bool, database_latency_ms: float) -> dict:
        states = list(self.simulator.states.values())
        connected = sum(1 for state in states if state.device_status != "Offline")
        uptime_seconds = max(1.0, (datetime.now(timezone.utc) - self.started_at).total_seconds())

        return {
            "services": [
                {
                    "key": "api",
                    "name": "FastAPI",
                    "role": "REST and websocket surface",
                    "state": "Operational",
                    "latency_ms": None,
                    "uptime_pct": 100.0,
                },
                {
                    "key": "database",
                    "name": "PostgreSQL",
                    "role": "Telemetry and analytics store",
                    "state": "Operational" if database_ok else "Down",
                    "latency_ms": round(database_latency_ms, 2),
                    "uptime_pct": 100.0 if database_ok else 0.0,
                },
                {
                    "key": "simulator",
                    "name": "MIKOS Sensor Engine",
                    "role": "Live telemetry generation",
                    "state": "Operational" if self.running else "Down",
                    "latency_ms": round(settings.tick_interval_seconds * 1000, 1),
                    "uptime_pct": 100.0 if self.running else 0.0,
                },
                {
                    "key": "ai",
                    "name": "AI Engine",
                    "role": "Anomaly scoring and degradation modelling",
                    "state": "Operational" if settings.ml_enabled else "Degraded",
                    "latency_ms": None,
                    "uptime_pct": 100.0,
                },
                {
                    "key": "ingest",
                    "name": "Ingest Gateway",
                    "role": "Sensor to platform transport",
                    "state": "Operational" if connected > 0 else "Degraded",
                    "latency_ms": None,
                    "uptime_pct": round(connected / max(1, len(states)) * 100, 1),
                },
            ],
            "database_latency_ms": round(database_latency_ms, 2),
            "uptime_seconds": round(uptime_seconds, 1),
            "sensors_connected": connected,
            "sensors_total": len(states),
            "ingest_per_minute": round(len(states) * (60.0 / settings.tick_interval_seconds), 1),
            "ticks_processed": self.tick,
            "ml_backend": ML_BACKEND,
            "simulator_running": self.running,
        }


#: Module-level singleton. FastAPI's lifespan starts and stops it; every router
#: reads the same instance, which is what keeps the modules consistent.
engine = InteloraEngine()


def get_engine() -> InteloraEngine:
    return engine
