"""End-to-end API verification.

Runs against a live server, so it exercises the real database, the real
background tasks and the real models rather than a stubbed application. It also
checks agreement *between* endpoints: the anomaly count on the dashboard has to
equal the anomaly count on the anomaly endpoint, and the fleet OEE has to be the
same number in both places it is published.

    venv\\Scripts\\python.exe -m pytest tests/test_api.py -q     (server must be running)
    venv\\Scripts\\python.exe tests/test_api.py                  (standalone report)
"""

from __future__ import annotations

import sys

import httpx
import pytest

BASE = "http://localhost:8000"
TIMEOUT = 60.0


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=TIMEOUT)


try:
    with _client() as _probe:
        SERVER_UP = _probe.get("/health").status_code == 200
except Exception:
    SERVER_UP = False

pytestmark = pytest.mark.skipif(not SERVER_UP, reason="backend is not running on :8000")


@pytest.fixture(scope="module")
def client():
    with _client() as instance:
        yield instance


@pytest.fixture(scope="module")
def dashboard(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    return response.json()


@pytest.fixture(scope="module")
def assets(client):
    response = client.get("/api/assets")
    assert response.status_code == 200
    return response.json()["assets"]


# ── Availability ────────────────────────────────────────────────────────


def test_health_probe(client):
    body = client.get("/health").json()
    assert body["assets"] == 24
    assert body["status"] in ("ok", "starting", "healthy")


def test_openapi_documents_every_endpoint(client):
    paths = client.get("/openapi.json").json()["paths"]
    for required in (
        "/api/dashboard",
        "/api/assets",
        "/api/assets/{asset_id}",
        "/api/telemetry/live",
        "/api/telemetry/history",
        "/api/anomalies",
        "/api/predictive",
        "/api/apm",
        "/api/oee",
    ):
        assert required in paths, f"{required} is missing from the published API"


# ── Estate ──────────────────────────────────────────────────────────────


def test_only_laptops_and_chargers_are_published(assets):
    assert {row["category"] for row in assets} == {"Laptop", "Mobile Charger"}
    assert len(assets) == 24


def test_asset_rows_carry_the_six_identity_fields(assets):
    for row in assets:
        for field in ("asset_id", "asset_name", "category", "brand", "model", "status"):
            assert field in row and row[field] not in (None, "")


def test_every_figure_is_computed_server_side(assets):
    for row in assets:
        assert 0 < row["health_score"] <= 100
        assert row["health_band"] in ("healthy", "good", "warning", "critical")
        assert row["rul_days"] >= 0
        assert 0.0 <= row["failure_probability"] <= 1.0
        assert 0 <= row["oee"] <= 100
        assert row["weakest_component"]


def test_asset_detail_exposes_six_components(client, assets):
    target = assets[0]["asset_id"]
    detail = client.get(f"/api/assets/{target}").json()

    assert len(detail["components"]) == 6
    assert len(detail["predictions"]) == 6
    assert detail["primary_prediction"] is not None
    assert detail["prescriptive"]["action"]
    assert abs(detail["health_score"] - assets[0]["health_score"]) < 1.0


def test_unknown_asset_is_a_404(client):
    assert client.get("/api/assets/NOPE-999").status_code == 404


# ── Telemetry ───────────────────────────────────────────────────────────

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


def test_live_publishes_all_fourteen_parameters(client):
    readings = client.get("/api/telemetry/live").json()["readings"]
    assert len(readings) == 24
    for reading in readings:
        for parameter in FOURTEEN:
            assert parameter in reading, f"{parameter} missing from {reading['asset_id']}"


def test_live_power_triangle_closes(client):
    for reading in client.get("/api/telemetry/live").json()["readings"]:
        expected = reading["voltage"] * reading["current"]
        assert abs(expected - reading["apparent_power"]) < 0.05, reading["asset_id"]


def test_history_serves_every_range(client, assets):
    target = assets[0]["asset_id"]
    for hours in (24, 168, 720):
        body = client.get("/api/telemetry/history", params={"asset_id": target, "hours": hours}).json()
        assert body["count"] > 0, f"no history at {hours}h"
        assert body["resolution"] in ("second", "minute", "quarter", "hour")


def test_history_filters_by_component(client):
    body = client.get("/api/telemetry/history", params={"component": "Battery", "hours": 48}).json()
    assert body["count"] > 0
    assert body["component"] == "Battery"


def test_history_summary_reports_all_resolutions(client):
    stored = {row["resolution"] for row in client.get("/api/telemetry/history/summary").json()["resolutions"]}
    assert {"hour", "quarter", "minute"} <= stored


def test_history_rejects_an_inverted_range(client):
    response = client.get(
        "/api/telemetry/history",
        params={"start": "2026-08-01T00:00:00Z", "end": "2026-07-01T00:00:00Z"},
    )
    assert response.status_code == 400


# ── Anomalies ───────────────────────────────────────────────────────────


def test_anomaly_journal_agrees_with_the_dashboard(client):
    """Two endpoints must report the same open count for the same instant.

    The estate is live, so two requests a second apart legitimately see
    different states. Both responses carry the tick they were computed from:
    same tick means the counts must match exactly, and a later tick is allowed
    to have moved by at most one event per tick that elapsed.
    """
    first = client.get("/api/dashboard").json()
    second = client.get("/api/anomalies", params={"limit": 50}).json()

    assert second["total"] > 0
    assert sum(second["severity_breakdown"].values()) == second["open_count"]

    elapsed = abs(second["meta"]["tick"] - first["meta"]["tick"])
    drift = abs(second["open_count"] - first["kpis"]["active_anomalies"])

    if elapsed == 0:
        assert drift == 0, "same tick, different open counts"
    else:
        assert drift <= elapsed, f"open count moved by {drift} across {elapsed} ticks"


def test_nine_detector_rules_are_published(client):
    definitions = client.get("/api/anomalies/definitions").json()["definitions"]
    codes = {row["error_code"] for row in definitions}
    assert len(definitions) == 9
    assert {"ANO-1001", "ANO-1006", "ANO-1009"} <= codes


def test_no_impossible_anomalies_are_published(client):
    for event in client.get("/api/anomalies", params={"limit": 500}).json()["anomalies"]:
        if event["anomaly_type"] == "communication-lost":
            continue
        if event["anomaly_type"] in ("voltage-low", "power-factor-low"):
            assert event["observed_value"] < event["threshold_value"]
        elif event["anomaly_type"] != "frequency-deviation":
            assert event["observed_value"] > event["threshold_value"]


# ── Maintenance and effectiveness ───────────────────────────────────────


def test_predictive_covers_the_estate(client, dashboard):
    body = client.get("/api/predictive").json()
    assert len(body["assets"]) == 24
    assert sum(bucket["count"] for bucket in body["rul_distribution"]) == 24
    assert abs(body["average_rul_days"] - dashboard["kpis"]["average_rul_days"]) < 1.0

    queue = body["component_queue"]
    assert all(a["rul_days"] <= b["rul_days"] + 1e-6 for a, b in zip(queue, queue[1:]))
    assert len(queue) == 24 * 6


def test_apm_ranks_without_publishing_telemetry(client):
    ranking = client.get("/api/apm").json()["ranking"]
    assert len(ranking) == 24
    assert all(a["oee"] >= b["oee"] - 1e-9 for a, b in zip(ranking, ranking[1:]))
    for forbidden in ("voltage", "current", "temperature", "active_power", "power_factor"):
        assert forbidden not in ranking[0], f"{forbidden} must not appear in a performance ranking"


def test_oee_is_the_product_of_its_factors(client, dashboard):
    body = client.get("/api/oee").json()
    assert abs(body["fleet"]["oee"] - dashboard["oee"]["oee"]) < 0.05

    for row in body["assets"]:
        expected = round(row["availability"] / 100 * row["performance"] / 100 * row["quality"] / 100 * 100, 1)
        assert abs(row["oee"] - expected) < 0.15, row["asset_id"]


def test_loss_cascade_explains_the_gap(client):
    body = client.get("/api/oee/losses").json()
    cascade = body["cascade"]
    assert len(cascade) == 5
    total = cascade[0]["value"] + sum(step["value"] for step in cascade[1:-1])
    assert abs(total - cascade[-1]["value"]) < 0.5


# ── Platform ────────────────────────────────────────────────────────────


def test_dashboard_is_internally_consistent(dashboard):
    kpis = dashboard["kpis"]
    assert kpis["total_assets"] == 24
    assert (
        kpis["healthy_assets"] + kpis["good_assets"] + kpis["warning_assets"] + kpis["critical_assets"]
        == 24
    )
    assert kpis["online_assets"] + kpis["standby_assets"] + kpis["offline_assets"] == 24
    assert sum(entry["count"] for entry in dashboard["risk_distribution"]) == 24
    assert len(dashboard["insights"]) == 4
    assert dashboard["energy"]["monthly_kwh"] > 0
    assert dashboard["yesterday"]["observed"] is True


def test_system_status_reports_live_state(client):
    body = client.get("/api/system/status").json()
    assert body["database_connected"] is True
    assert body["scheduler"]["running"] is True
    assert body["platform"]["ml_backend"] == "scikit-learn"

    ticks = body["platform"]["ticks_processed"]

    # Both of these need the engine to have run for a while: the first flush
    # lands on the first tick, and a model cannot be fitted before the window
    # holds enough samples to fit one. Asserting either against a cold engine
    # would make this test fail for a reason that is not a defect.
    if ticks > 2:
        assert body["scheduler"]["rows_written"] > 0

    from app.config import settings

    if ticks > settings.ml_min_training_samples + 30:
        assert len(body["anomaly_models"]) == 24, "models should be fitted once the window has filled"


def test_acknowledge_round_trip(client):
    active = client.get("/api/anomalies", params={"status": "Active", "limit": 1}).json()["anomalies"]
    if not active:
        pytest.skip("nothing unclaimed to acknowledge")

    uid = active[0]["uid"]
    response = client.post(f"/api/anomalies/{uid}/acknowledge")
    assert response.status_code == 200
    assert response.json()["acknowledged"] == 1

    reread = client.get(f"/api/anomalies/{uid}").json()
    assert reread["status"] == "Acknowledged"
    assert reread["acknowledged_at"] is not None


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
