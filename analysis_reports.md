# Project Report Summary

## Report 1: Real-time data support

**Question:** does this project supports real time data

**Answer:** Yes.

- Backend has a live websocket route: `backend/app/routers/system.py` → `/api/ws/telemetry`
- `backend/app/services/scheduler.py` generates live ticks and broadcasts them to connected clients
- Frontend `src/services/platformStore.ts` consumes live websocket frames and falls back to polling if needed
- The app includes live views such as `src/pages/LiveTelemetryPage.tsx` and anomaly/live-stream dashboards

---

## Report 2: MQTT implementation

**Question:** does the code for mqtt written

**Answer:** No, not in a usable ingest form.

- MQTT appears only as metadata/status:
  - `backend/app/models/asset.py` defines `mqtt_topic`
  - `backend/app/mock_data/catalog.py` generates mock `mqtt_topic` values
  - frontend status/UI reports `mqttConnected` and `gatewayConnected`
- There is no MQTT client library import, no broker subscription code, and no MQTT ingestion adapter in the repo

---

## Report 3: Real sensor via MQTT and detection behavior

**Question:** now if i connect to a real time sensor and parse it through mqtt does this project detect anomaly, predictive maintenance

**Answer:** The detection and predictive logic exist, but MQTT ingestion does not.

- `backend/app/services/anomaly_service.py` implements anomaly detection rules, hysteresis, model scoring, and event journaling
- `backend/app/services/predictive_service.py` implements predictive maintenance output, failure probability, RUL, and recommendations
- However, current live data input is from the simulator engine, not from real MQTT sensor data

> To use a real sensor over MQTT, you would need to add an MQTT ingestion component that converts sensor messages into `Reading` objects and feeds them into the engine/pipeline.
