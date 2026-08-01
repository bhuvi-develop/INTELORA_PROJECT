"""Live websocket feed.

The REST endpoints answer "what is the state now"; the websocket answers "tell me
every time it changes". This checks that the feed actually pushes on the tick,
carries the full parameter set, and stays internally consistent frame to frame —
a stream that jumped between frames would be no more usable than random numbers.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

WS_URL = "ws://localhost:8000/api/ws/telemetry"

try:
    import websockets

    WEBSOCKETS_AVAILABLE = True
except ImportError:  # pragma: no cover
    WEBSOCKETS_AVAILABLE = False

try:
    SERVER_UP = httpx.get("http://localhost:8000/health", timeout=10.0).status_code == 200
except Exception:
    SERVER_UP = False

pytestmark = pytest.mark.skipif(
    not (SERVER_UP and WEBSOCKETS_AVAILABLE),
    reason="backend not running on :8000, or the websockets client is unavailable",
)

FOURTEEN = (
    "voltage",
    "current",
    "active_power",
    "apparent_power",
    "reactive_power",
    "power_factor",
    "frequency",
    "energy_kwh",
    "runtime_hours",
    "temperature",
    "relay_status",
    "relay_operations",
    "ts",
    "device_status",
)


async def _collect(count: int) -> list[dict]:
    async with websockets.connect(WS_URL) as socket:
        return [json.loads(await asyncio.wait_for(socket.recv(), timeout=15)) for _ in range(count)]


def test_feed_pushes_every_tick():
    frames = asyncio.run(_collect(3))

    assert len(frames) == 3
    for frame in frames:
        assert frame["type"] == "telemetry"
        assert len(frame["readings"]) == 24

    ticks = [frame["tick"] for frame in frames]
    assert ticks == sorted(ticks), "frames arrived out of order"
    assert ticks[-1] - ticks[0] == len(frames) - 1, "a tick was dropped or duplicated"


def test_frames_carry_all_fourteen_parameters():
    frame = asyncio.run(_collect(1))[0]
    for reading in frame["readings"]:
        for parameter in FOURTEEN:
            assert parameter in reading, f"{parameter} missing from {reading['asset_id']}"


def test_consecutive_frames_move_smoothly():
    """The stream must read as a sensor, not a generator."""
    frames = asyncio.run(_collect(3))

    for previous, current in zip(frames, frames[1:]):
        before = {reading["asset_id"]: reading for reading in previous["readings"]}

        for reading in current["readings"]:
            prior = before[reading["asset_id"]]
            if "Offline" in (prior["device_status"], reading["device_status"]):
                continue

            assert reading["energy_kwh"] >= prior["energy_kwh"] - 1e-9, "energy went backwards"
            assert reading["runtime_hours"] >= prior["runtime_hours"] - 1e-9, "runtime went backwards"
            assert abs(reading["temperature"] - prior["temperature"]) < 1.5, "temperature jumped"

            if prior["voltage"] > 1:
                delta = abs(reading["voltage"] - prior["voltage"]) / prior["voltage"]
                assert delta < 0.1, f"{reading['asset_id']} voltage jumped {delta:.1%}"


def test_published_triangle_closes_on_the_wire():
    frame = asyncio.run(_collect(1))[0]
    for reading in frame["readings"]:
        assert abs(reading["voltage"] * reading["current"] - reading["apparent_power"]) < 0.05
