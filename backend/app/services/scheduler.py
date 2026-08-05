"""Background tasks.

Three loops run for the life of the process, all started by FastAPI's lifespan —
nothing here needs a manual trigger.

    tick       every second: advance the estate, judge every reading, store it
    analytics  every 30s:    refit the models and recompute the derived state
    retention  every 15m:    prune raw telemetry past the retention window

Database work is handed to a worker thread. SQLAlchemy's synchronous session
would otherwise block the event loop for the duration of every insert, and at
one insert per second that is a stall the websocket clients would feel.

The tick loop schedules against a fixed origin rather than sleeping for a fixed
interval, so a slow write does not push every subsequent tick later. If the
process falls far enough behind, the schedule is re-based instead of trying to
catch up — replaying a backlog of seconds would produce a burst of readings that
never happened.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime, timezone

from app.config import settings
from app.database.base import session_scope
from app.logging_config import get_logger
from app.services.engine import InteloraEngine, StepResult
from app.services.insight_service import build_all
from app.services.mqtt_listener import mqtt_listener
from app.services.persistence import (
    persist_anomalies,
    prune_analytics,
    prune_raw_telemetry,
    sync_asset_state,
    sync_component_wear,
    write_analytics,
    write_insights,
    write_readings,
)
from app.services.simulator import Reading

logger = get_logger(__name__)


class ConnectionManager:
    """Websocket fan-out for the live feed."""

    def __init__(self) -> None:
        self._clients: set = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        logger.info("websocket client connected (%d total)", len(self._clients))

    async def disconnect(self, websocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)
        logger.info("websocket client disconnected (%d remaining)", len(self._clients))

    async def broadcast(self, payload: dict) -> None:
        if not self._clients:
            return
        async with self._lock:
            targets = list(self._clients)

        dead = []
        for client in targets:
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)

        if dead:
            async with self._lock:
                for client in dead:
                    self._clients.discard(client)

    @property
    def client_count(self) -> int:
        return len(self._clients)


class BackgroundScheduler:
    def __init__(self, engine: InteloraEngine, manager: ConnectionManager) -> None:
        self.engine = engine
        self.manager = manager
        self._tasks: list[asyncio.Task] = []
        self._buffer: list[Reading] = []
        self._ticks_since_flush = 0
        self.rows_written = 0
        self.last_flush_at: datetime | None = None
        self.last_analytics_at: datetime | None = None
        self._stopping = asyncio.Event()
        self.telemetry_source = "Simulator"

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._tasks:
            return
        self._stopping.clear()
        self.engine.running = True
        mqtt_listener.start()
        self._tasks = [
            asyncio.create_task(self._tick_loop(), name="intelora-tick"),
            asyncio.create_task(self._analytics_loop(), name="intelora-analytics"),
            asyncio.create_task(self._retention_loop(), name="intelora-retention"),
        ]
        logger.info(
            "background tasks started (tick %.0fms, analytics %ds, retention %ds)",
            settings.tick_interval_seconds * 1000,
            settings.analytics_interval_seconds,
            settings.retention_interval_seconds,
        )

    async def stop(self) -> None:
        self._stopping.set()
        self.engine.running = False
        mqtt_listener.stop()

        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks.clear()

        # Anything generated since the last flush is still worth keeping.
        if self._buffer:
            await asyncio.to_thread(self._flush, list(self._buffer))
            self._buffer.clear()

        logger.info("background tasks stopped after %d ticks", self.engine.tick)

    # ── Loops ───────────────────────────────────────────────────────────

    async def _tick_loop(self) -> None:
        loop = asyncio.get_running_loop()
        interval = settings.tick_interval_seconds
        next_at = loop.time() + interval

        while not self._stopping.is_set():
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # a failed tick must not kill the stream
                logger.exception("tick failed: %s", error)

            next_at += interval
            delay = next_at - loop.time()
            if delay < -interval * 5:
                # Far enough behind that catching up would fabricate a burst of
                # readings. Re-base and carry on from now.
                logger.warning("tick loop fell %.1fs behind, re-basing schedule", -delay)
                next_at = loop.time() + interval
                delay = interval
            await asyncio.sleep(max(0.0, delay))

    async def _tick(self) -> None:
        if self.engine.telemetry_source == "Live MQTT":
            readings = mqtt_listener.pop_all()
            if readings:
                result = self.engine.process_external(readings)
            else:
                live_r = self.engine.get_live_readings()
                self.engine.tick += 1
                result = StepResult(readings=live_r, events=[], tick=self.engine.tick, at=datetime.now(timezone.utc))
        else:
            result = self.engine.step()

        self._buffer.extend(result.readings)
        self._ticks_since_flush += 1

        if self._ticks_since_flush >= settings.persist_every_n_ticks:
            batch = self._buffer
            self._buffer = []
            self._ticks_since_flush = 0
            await asyncio.to_thread(self._flush, batch)

        if result.events:
            await asyncio.to_thread(self._flush_events)

        if self.manager.client_count:
            await self.manager.broadcast(
                {
                    "type": "telemetry",
                    "tick": result.tick,
                    "at": result.at.isoformat(),
                    "readings": [_reading_payload(reading) for reading in result.readings],
                    "events": [
                        {
                            "uid": event.uid,
                            "asset_id": event.asset_id,
                            "error_code": event.error_code,
                            "title": event.title,
                            "severity": event.severity,
                            "status": event.status,
                        }
                        for event in result.events
                    ],
                }
            )

    async def _analytics_loop(self) -> None:
        # Let a little history accumulate before the first fit rather than
        # fitting a model to four samples.
        await asyncio.sleep(min(15.0, settings.analytics_interval_seconds))

        while not self._stopping.is_set():
            try:
                self.engine.fit_models()
                analytics = self.engine.refresh_analytics()
                insights = build_all(self.engine)
                await asyncio.to_thread(self._flush_analytics, analytics, insights)
                self.last_analytics_at = datetime.now(timezone.utc)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.exception("analytics pass failed: %s", error)

            await asyncio.sleep(settings.analytics_interval_seconds)

    async def _retention_loop(self) -> None:
        await asyncio.sleep(settings.retention_interval_seconds)

        while not self._stopping.is_set():
            try:
                await asyncio.to_thread(self._prune)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.exception("retention pass failed: %s", error)

            await asyncio.sleep(settings.retention_interval_seconds)

    # ── Worker-thread bodies ────────────────────────────────────────────

    def _flush(self, batch: list[Reading]) -> None:
        if not batch:
            return
        with session_scope() as session:
            self.rows_written += write_readings(session, batch)
        self.last_flush_at = datetime.now(timezone.utc)

    def _flush_events(self) -> None:
        with session_scope() as session:
            created, updated = persist_anomalies(session, self.engine.detector)
        if created:
            logger.debug("persisted %d new anomalies, updated %d", created, updated)

    def _flush_analytics(self, analytics, insights: list[dict]) -> None:
        with session_scope() as session:
            write_analytics(session, analytics)
            write_insights(session, insights)
            sync_asset_state(session, self.engine)
            sync_component_wear(session, self.engine)
            persist_anomalies(session, self.engine.detector)

        self._flush_apm()

    def _flush_apm(self) -> None:
        """Snapshot the Asset Performance Management composites for its trend.

        Isolated in its own transaction and its own try, deliberately. APM is a
        downstream consumer: it reads what the pass above produced and adds nothing
        the platform depends on, so a failure inside it must not roll back the
        telemetry, anomaly and effectiveness writes that had already succeeded, and
        must not kill the analytics loop.
        """
        try:
            from app.services.apm.apm_service import get_apm_service
            from app.services.apm.repository import write_snapshots
            from app.services.apm.work_orders import get_work_order_engine

            snapshot = get_apm_service().refresh(self.engine)
            write_snapshots(
                [record.snapshot_row(snapshot.computed_at) for record in snapshot.ordered]
            )
            # Mirror anything a mid-outage transition left unwritten.
            get_work_order_engine().flush()
        except Exception as error:  # pragma: no cover - logged, never raised
            logger.warning("APM analytics pass not persisted: %s", error)

    def _prune(self) -> None:
        with session_scope() as session:
            prune_raw_telemetry(session, settings.raw_retention_hours)
            prune_analytics(session)
        self.engine.detector.prune()

        try:
            # APM's snapshot table is a trend and is bounded on the same schedule.
            # Its work orders are never pruned — they are the audit log.
            from app.services.apm.repository import prune_snapshots

            prune_snapshots()
        except Exception as error:  # pragma: no cover
            logger.warning("APM snapshots not pruned: %s", error)

    # ── Status ──────────────────────────────────────────────────────────

    def status(self) -> dict:
        return {
            "running": self.engine.running,
            "source": self.telemetry_source,
            "ticks": self.engine.tick,
            "tick_interval_seconds": settings.tick_interval_seconds,
            "rows_written": self.rows_written,
            "buffered_rows": len(self._buffer),
            "last_flush_at": self.last_flush_at,
            "last_analytics_at": self.last_analytics_at,
            "websocket_clients": self.manager.client_count,
            "tasks": [task.get_name() for task in self._tasks],
        }


def _reading_payload(reading: Reading) -> dict:
    return {
        "asset_id": reading.asset_id,
        "device_uid": reading.device_uid,
        "ts": reading.ts.isoformat(),
        "voltage": reading.voltage,
        "current": reading.current,
        "active_power": reading.active_power,
        "apparent_power": reading.apparent_power,
        "reactive_power": reading.reactive_power,
        "power_factor": reading.power_factor,
        "frequency": reading.frequency,
        "energy_kwh": reading.energy_kwh,
        "runtime_hours": reading.runtime_hours,
        "temperature": reading.temperature,
        "relay_status": reading.relay_status,
        "relay_operations": reading.relay_operations,
        "device_status": reading.device_status,
        "health_score": reading.health_score,
        "load_state": reading.load_state,
    }


#: Created by the application factory once the engine exists.
manager = ConnectionManager()
scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler | None:
    return scheduler


def build_scheduler(engine: InteloraEngine) -> BackgroundScheduler:
    global scheduler
    scheduler = BackgroundScheduler(engine, manager)
    return scheduler
