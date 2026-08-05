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


from collections import defaultdict, deque

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

        self.telemetry_source: str = "Simulator"
        self.mqtt_history: dict[str, deque[Reading]] = defaultdict(lambda: deque(maxlen=settings.live_window_samples))
        self.mqtt_receive_times: dict[str, datetime] = {}
        
        # Session isolation for physical gateway connections
        self.active_session_sender_uid: str | None = None
        self.candidate_sessions: dict[str, set[str]] = defaultdict(set)
        self.session_latch_time: datetime | None = None
        
        self.mqtt_received_count: int = 0

        self._analytics: Analytics = Analytics(computed_at=self.started_at)
        self._lock = threading.RLock()

    def set_telemetry_source(self, source: str) -> None:
        """Switch between Simulator and Live MQTT telemetry."""
        with self._lock:
            if source not in ["Simulator", "Live MQTT"]:
                raise ValueError(f"Invalid source: {source}")
            self.telemetry_source = source
            
            # Reset session latching and history when switching modes
            self.active_session_sender_uid = None
            self.candidate_sessions.clear()
            self.session_latch_time = None
            self.mqtt_history.clear()
            self.mqtt_receive_times.clear()
            self.mqtt_received_count = 0
            self.detector.journal.clear()
            self.detector._by_uid.clear()
            self.detector._breaches.clear()
            self._analytics = Analytics(computed_at=datetime.now(timezone.utc))
            self.refresh_analytics()

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

    def process_external(self, readings: list[Reading], dt: float | None = None, *, now: datetime | None = None) -> StepResult:
        """Process external readings directly without generating mock data."""
        interval = settings.tick_interval_seconds if dt is None else dt
        with self._lock:
            self.tick += 1
            self.mqtt_received_count += len(readings)

            # 1. Wait for physical gateway traffic
            if self.active_session_sender_uid is None:
                if self.session_latch_time is None:
                    self.session_latch_time = datetime.now(timezone.utc)
                
                # Gather candidate sender_uids and their unique device counts for 3 seconds
                for reading in readings:
                    if reading.sender_uid:
                        self.candidate_sessions[reading.sender_uid].add(reading.asset_id)
                
                if (datetime.now(timezone.utc) - self.session_latch_time).total_seconds() > 3.0:
                    # After 3 seconds, evaluate the collected candidates
                    valid_candidates = {uid: len(devices) for uid, devices in self.candidate_sessions.items() if len(devices) > 0}
                    if valid_candidates:
                        # Latch onto the gateway with the FEWEST unique devices (heuristic for user's physical connection)
                        self.active_session_sender_uid = min(valid_candidates, key=valid_candidates.get)
                        logger.info(f"Session latched to sender_uid: {self.active_session_sender_uid} with {valid_candidates[self.active_session_sender_uid]} devices")
                        self.candidate_sessions.clear()
                        self.session_latch_time = None
                    else:
                        # Reset if no valid candidates found yet
                        self.session_latch_time = None
                        
                # Until the 3-second discovery phase successfully latches, drop all traffic
                return StepResult(readings=[], events=[], tick=self.tick, at=now or datetime.now(timezone.utc))
                
            # 2. Drop cross-traffic from other gateways or developers
            accepted_readings = []
            for reading in readings:
                if reading.sender_uid == self.active_session_sender_uid:
                    accepted_readings.append(reading)

            if not accepted_readings:
                return StepResult(readings=[], events=[], tick=self.tick, at=now or datetime.now(timezone.utc))

            events: list[AnomalyEvent] = []
            for reading in accepted_readings:
                self.mqtt_history[reading.asset_id].append(reading)

                if reading.asset_id not in self.simulator.states:
                    ref_key = "CHR-001" if "CHR" in reading.asset_id else "LAP-001"
                    if ref_key in self.simulator.states:
                        ref = self.simulator.states[ref_key]
                        self.simulator.states[reading.asset_id] = AssetState(
                            seed=ref.seed,
                            profile=ref.profile,
                            health=reading.health_score,
                            wear=[0.05] * len(ref.profile.components),
                            wear_rate=[c.base_wear_per_day for c in ref.profile.components],
                            band="healthy",
                            device_status=reading.device_status,
                            load_state=reading.load_state,
                            history=deque(maxlen=900)
                        )

                if reading.asset_id in self.simulator.states:
                    state = self.simulator.states[reading.asset_id]
                    if "voltage" in reading.present_parameters or reading.voltage > 0:
                        state.voltage = reading.voltage
                    if "current" in reading.present_parameters or reading.current > 0:
                        state.current = reading.current
                    if "active_power" in reading.present_parameters or reading.active_power > 0:
                        state.active_power = reading.active_power
                    if "temperature" in reading.present_parameters or reading.temperature > 0:
                        state.temperature = reading.temperature

                    state.health = reading.health_score
                    state.device_status = reading.device_status
                    state.load_state = reading.load_state
                    state.history.append(reading)

                    # Thermal & electrical stress wear progression for predictive maintenance
                    if reading.temperature > 40.0:
                        thermal_stress = max(0.0, (reading.temperature - 40.0) / 30.0)
                        for i in range(len(state.wear)):
                            state.wear[i] = min(0.95, state.wear[i] + (0.005 + thermal_stress * 0.02))

                    events.extend(self.detector.evaluate(state, reading, interval))

            self.last_tick_at = now or datetime.now(timezone.utc)
            self.refresh_analytics()
            return StepResult(readings=readings, events=events, tick=self.tick, at=self.last_tick_at)

    def get_active_asset_ids(self) -> list[str]:
        with self._lock:
            if "MQTT" in self.telemetry_source or self.telemetry_source == "Live MQTT":
                now = datetime.now(timezone.utc)
                active = []
                for aid, history in self.mqtt_history.items():
                    if history:
                        last_ts = history[-1].ts
                        if last_ts.tzinfo is None:
                            last_ts = last_ts.replace(tzinfo=timezone.utc)
                        if (now - last_ts).total_seconds() <= 60.0:
                            active.append(aid)
                            
                # Release session latch if all connected assets go offline
                if not active:
                    self.active_session_sender_uid = None
                    
                return active
            return list(self.simulator.states.keys())

    def get_live_reading(self, asset_id: str) -> Reading:
        with self._lock:
            if self.telemetry_source == "Live MQTT":
                if asset_id in self.mqtt_history and self.mqtt_history[asset_id]:
                    return self.mqtt_history[asset_id][-1]
                
                device_uid = f"uid_{asset_id.lower()}"
                if asset_id in self.simulator.states:
                    device_uid = self.simulator.states[asset_id].device_uid

                return Reading(
                    asset_id=asset_id,
                    device_uid=device_uid,
                    ts=datetime.now(timezone.utc),
                    voltage=0.0,
                    current=0.0,
                    active_power=0.0,
                    apparent_power=0.0,
                    reactive_power=0.0,
                    power_factor=0.0,
                    frequency=0.0,
                    energy_kwh=0.0,
                    runtime_hours=0.0,
                    temperature=0.0,
                    relay_status="Open",
                    relay_operations=0,
                    device_status="Offline",
                    health_score=100.0,
                    load_state="Waiting for MQTT Sensor",
                    resolution="second",
                    source="Live MQTT"
                )
            else:
                if asset_id in self.simulator.states and self.simulator.states[asset_id].history:
                    return self.simulator.states[asset_id].history[-1]
                
                device_uid = f"uid_{asset_id.lower()}"
                if asset_id in self.simulator.states:
                    device_uid = self.simulator.states[asset_id].device_uid

                return Reading(
                    asset_id=asset_id,
                    device_uid=device_uid,
                    ts=datetime.now(timezone.utc),
                    voltage=0.0,
                    current=0.0,
                    active_power=0.0,
                    apparent_power=0.0,
                    reactive_power=0.0,
                    power_factor=0.0,
                    frequency=0.0,
                    energy_kwh=0.0,
                    runtime_hours=0.0,
                    temperature=0.0,
                    relay_status="Closed",
                    relay_operations=0,
                    device_status="Online",
                    health_score=100.0,
                    load_state="Idle",
                    resolution="second",
                    source="Simulator"
                )

    def get_live_readings(self, asset_id: str | None = None, category: str | None = None) -> list[Reading]:
        with self._lock:
            active_ids = self.get_active_asset_ids()
            if asset_id:
                if asset_id in active_ids or self.telemetry_source == "Simulator":
                    return [self.get_live_reading(asset_id)]
                return []
            
            readings = []
            for id_str in active_ids:
                state = self.simulator.states.get(id_str)
                if state and (category is None or state.seed.category == category):
                    readings.append(self.get_live_reading(id_str))
            return readings

    def get_window(self, asset_id: str, samples: int = 300) -> list[Reading]:
        with self._lock:
            if self.telemetry_source == "Live MQTT":
                if asset_id in self.mqtt_history:
                    return list(self.mqtt_history[asset_id])[-samples:]
                return []
            else:
                if asset_id in self.simulator.states:
                    return self.simulator.window(asset_id, samples)
                return []

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
            active_ids = self.get_active_asset_ids()

            for asset_id in active_ids:
                if asset_id not in self.simulator.states:
                    continue
                state = self.simulator.states[asset_id]
                if self.telemetry_source == "Live MQTT":
                    if asset_id in self.mqtt_history and self.mqtt_history[asset_id]:
                        prediction = self.predictive.predict(state, stamp)
                        open_events = self.detector.active_by_asset(asset_id)
                        anomalies_cnt = self.detector.count_last_24h(asset_id, stamp)
                    else:
                        prediction = self.predictive.clean_predict(state, stamp)
                        open_events = []
                        anomalies_cnt = 0
                else:
                    prediction = self.predictive.predict(state, stamp)
                    open_events = self.detector.active_by_asset(asset_id)
                    anomalies_cnt = self.detector.count_last_24h(asset_id, stamp)

                predictions[asset_id] = prediction

                critical_open = sum(1 for event in open_events if event.severity == "Critical")
                resolved = [
                    event.minutes_open(stamp)
                    for event in self.detector.journal
                    if event.asset_id == asset_id and event.resolved_at is not None
                ]

                performance[asset_id] = self.performance.compute(
                    state=state,
                    anomalies_24h=anomalies_cnt,
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
            active_ids = self.get_active_asset_ids()
            total = len(active_ids)

            if self.telemetry_source == "Live MQTT":
                latest_mqtt = [self.mqtt_history[aid][-1] for aid in active_ids if aid in self.mqtt_history and self.mqtt_history[aid]]
                online_mqtt = sum(1 for r in latest_mqtt if r.device_status == "Online")
                standby_mqtt = sum(1 for r in latest_mqtt if r.device_status == "Standby")
                offline_mqtt = total - (online_mqtt + standby_mqtt)
                total_power = sum(r.active_power for r in latest_mqtt)
                total_energy = sum(r.energy_kwh for r in latest_mqtt)
                mean_health = round(sum(r.health_score for r in latest_mqtt) / len(latest_mqtt), 1) if latest_mqtt else 100.0

                open_events = self.detector.open_events()
                active_anomalies_cnt = len(open_events)
                critical_anomalies_cnt = sum(1 for e in open_events if e.severity == "Critical")
                unack_alerts_cnt = sum(1 for e in open_events if e.status == "Active")

                kpis.update(
                    {
                        "total_assets": total,
                        "online_assets": online_mqtt,
                        "standby_assets": standby_mqtt,
                        "offline_assets": offline_mqtt,
                        "average_health": mean_health,
                        "healthy_assets": sum(1 for r in latest_mqtt if r.health_score >= 90),
                        "good_assets": sum(1 for r in latest_mqtt if 75 <= r.health_score < 90),
                        "warning_assets": sum(1 for r in latest_mqtt if 60 <= r.health_score < 75),
                        "critical_assets": sum(1 for r in latest_mqtt if r.health_score < 60),
                        "total_power_w": round(total_power, 2),
                        "average_power_w": round(total_power / total, 2) if total > 0 else 0.0,
                        "total_energy_kwh": round(total_energy, 4),
                        "active_anomalies": active_anomalies_cnt,
                        "critical_anomalies": critical_anomalies_cnt,
                        "unacknowledged_alerts": unack_alerts_cnt,
                        "operational_health": mean_health,
                        "computed_at": datetime.now(timezone.utc),
                    }
                )
                return kpis

            states = [self.simulator.states[aid] for aid in active_ids if aid in self.simulator.states]
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
        active_ids = self.get_active_asset_ids()
        states = [self.simulator.states[aid] for aid in active_ids if aid in self.simulator.states]
        total = len(active_ids)
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
        active_ids = self.get_active_asset_ids()
        states = [self.simulator.states[aid] for aid in active_ids if aid in self.simulator.states]
        if "MQTT" in self.telemetry_source or self.telemetry_source == "Live MQTT":
            latest_mqtt = [self.mqtt_history[aid][-1] for aid in active_ids if aid in self.mqtt_history and self.mqtt_history[aid]]
            connected = sum(1 for r in latest_mqtt if r.device_status != "Offline")
        else:
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
                    "state": "Operational" if (connected > 0 or len(active_ids) == 0) else "Degraded",
                    "latency_ms": None,
                    "uptime_pct": round(connected / max(1, len(active_ids)) * 100, 1) if active_ids else 100.0,
                },
            ],
            "database_latency_ms": round(database_latency_ms, 2),
            "uptime_seconds": round(uptime_seconds, 1),
            "sensors_connected": connected,
            "sensors_total": len(active_ids),
            "ingest_per_minute": round(len(active_ids) * (60.0 / settings.tick_interval_seconds), 1),
            "ticks_processed": self.tick,
            "ml_backend": ML_BACKEND,
            "simulator_running": self.running,
        }


#: Module-level singleton. FastAPI's lifespan starts and stops it; every router
#: reads the same instance, which is what keeps the modules consistent.
engine = InteloraEngine()


def get_engine() -> InteloraEngine:
    return engine
