# INTELORA Backend

Python backend for the INTELORA Enterprise AIoT platform. It simulates the MIKOS
Smart Energy Sensor across a commissioned estate of **Laptops** and **Mobile
Chargers**, stores every reading in PostgreSQL, computes all condition, anomaly,
predictive and effectiveness figures in Python, and serves them over REST and a
websocket.

The React frontend calculates none of this. Health score, anomaly score, failure
probability, remaining useful life, maintenance priority, criticality, OEE and
asset performance are all produced here and consumed as finished numbers.

---

## Quick start

```bat
cd backend
start_backend.bat
```

The script creates the virtual environment, installs the requirements, creates
`intelora_db` if it is missing, applies migrations and starts the service:

```
====================================
 INTELORA Backend Started

 API      http://localhost:8000
 Swagger  http://localhost:8000/docs
====================================
```

To stop it:

```bat
stop_backend.bat
```

`stop_backend.bat` asks the process to exit rather than killing it, so the
shutdown handler runs: background tasks are cancelled, buffered telemetry is
flushed, and component wear is written back. A forced kill is only used if the
process ignores the request.

### Manual run

```bat
venv\Scripts\python.exe main.py
venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Requirements

- Python 3.12 or newer
- PostgreSQL 14 or newer, running and reachable

Configuration is read from `.env`; copy `.env.example` and change what differs on
your machine. Every value has a working default, so an empty `.env` is valid.

---

## What starts automatically

Starting the process is the whole operation. The FastAPI lifespan handler:

1. creates `intelora_db` if the server does not have it
2. ensures the schema
3. seeds the asset register, its components and its MIKOS sensors
4. restores accumulated component wear from the database
5. back-fills 30 days of history if none is stored
6. runs a first analytics pass so the first request returns a populated estate
7. starts the sensor engine ticking **once per second**

No manual trigger, no separate worker process, no scheduler service.

---

## Project layout

```
backend/
  main.py                     FastAPI application and lifespan
  requirements.txt
  .env.example
  alembic.ini / alembic/      Migrations
  start_backend.bat
  stop_backend.bat
  logs/                       Rotating application log
  tests/                      Simulator, consistency and API tests
  app/
    config.py                 Settings, sourced from the environment
    logging_config.py
    database/
      base.py                 Engine, session factory, declarative base
      init_db.py              Database creation, schema, seeding
      backfill.py             30-day history generation
    models/                   SQLAlchemy ORM
    schemas/                  Pydantic response models
    mock_data/
      catalog.py              Categories, components, profiles, asset seeds
      signals.py              Deterministic noise and fault injection
    services/
      simulator.py            MIKOS sensor model
      derive.py               Business logic — every derived figure
      anomaly_service.py      Threshold detection with hysteresis
      predictive_service.py   Failure probability and remaining life
      performance_service.py  Availability, performance, quality, OEE
      insight_service.py      AI insight narratives
      dashboard_service.py    Energy, prior-day baseline, activity
      engine.py               The running platform — single source of truth
      persistence.py          Writing state into PostgreSQL
      scheduler.py            Background tasks and websocket fan-out
    ml/
      anomaly_model.py        Per-asset isolation forest
      degradation_model.py    Health regression, blending and ratchet
      features.py
    routers/                  HTTP surface
```

---

## API

Base URL `http://localhost:8000`, prefix `/api`. Interactive documentation at
`/docs`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard` | Full executive cockpit snapshot in one request |
| GET | `/api/dashboard/kpis` | KPI block only, for faster polling |
| GET | `/api/assets` | Commissioned assets with condition, filterable |
| GET | `/api/assets/{asset_id}` | One asset in full |
| GET | `/api/assets/{asset_id}/components` | Component wear and prediction |
| GET | `/api/telemetry/live` | Latest reading per device |
| GET | `/api/telemetry/live/{asset_id}/window` | Rolling in-memory window |
| GET | `/api/telemetry/history` | Stored history by asset, component and range |
| GET | `/api/telemetry/history/summary` | What history is stored, per resolution |
| GET | `/api/anomalies` | Anomaly journal, filterable |
| GET | `/api/anomalies/definitions` | Detector rules and error codes |
| GET | `/api/anomalies/{uid}` | One anomaly in full |
| POST | `/api/anomalies/{uid}/acknowledge` | Claim an alert |
| POST | `/api/anomalies/acknowledge-all` | Claim every unassigned alert |
| GET | `/api/predictive` | Failure probability and remaining life |
| GET | `/api/predictive/queue` | Component intervention queue |
| GET | `/api/apm` | Fleet performance comparison |
| GET | `/api/apm/comparison` | Head-to-head comparison of named assets |
| GET | `/api/oee` | Fleet and per-asset effectiveness |
| GET | `/api/oee/losses` | Where effectiveness is being lost |
| GET | `/api/system/status` | Platform, scheduler and model state |
| POST | `/api/system/refresh` | Force an analytics pass |
| WS | `/api/ws/telemetry` | Live push, one message per tick |
| GET | `/health` | Liveness probe |

Every response carries a `meta` block with `generated_at` and `tick`. Two
responses with the same tick were computed from the same estate state, which is
how a caller can tell whether two panels on a screen are showing the same
instant.

---

## The MIKOS simulation

No hardware exists, so `services/simulator.py` stands in for it. It does not
invent numbers: each reading comes out of a small physical model, and the
fourteen published parameters relate to one another as they would on a real
meter.

```
active power  ← demanded by the operating mode, reached through a first-order lag
voltage       ← nominal, less the sag its own current causes across the supply
current       ← P / (V · PF)
apparent      ← V · I
reactive      ← √(S² − P²)
energy        ← the running integral of active power
temperature   ← a thermal mass warming toward ambient + rise · load
wear          ← accrued from heat, load and switching, never reversed
health        ← a function of wear, so it moves only as wear moves
```

### The fourteen parameters

| # | Parameter | Column | Unit |
| --- | --- | --- | --- |
| 1 | Voltage | `voltage` | V |
| 2 | Current | `current` | A |
| 3 | Active Power | `active_power` | W |
| 4 | Apparent Power | `apparent_power` | VA |
| 5 | Reactive Power | `reactive_power` | VAR |
| 6 | Power Factor | `power_factor` | — |
| 7 | Frequency | `frequency` | Hz |
| 8 | Energy | `energy_kwh` | kWh, cumulative |
| 9 | Runtime | `runtime_hours` | h, cumulative |
| 10 | Temperature | `temperature` | °C |
| 11 | Relay Status | `relay_status` | Closed / Open |
| 12 | Relay Operations | `relay_operations` | count |
| 13 | Timestamp | `ts` | UTC |
| 14 | Device Status | `device_status` | Online / Standby / Offline |

### Realistic behaviour, not random values

Each device runs a state machine of operating modes with dwell times drawn
deterministically per unit. A laptop moves between Charging, Active, Idle and
Standby; a charger between Heavy Load, Charging, Trickle and Idle. Demand
changes when the mode changes, and everything downstream follows through its own
time constant, so the sequences in the specification fall out of the model rather
than being scripted:

**Laptop starts charging** — demand rises, so current climbs, so power climbs,
so the thermal target rises and temperature follows it over the next few minutes,
so energy accumulates faster, so wear accrues faster, so health drifts down.

**Laptop enters idle** — demand falls, current and power fall with it, the
thermal target drops and the device cools gradually rather than instantly, and
energy accumulation slows.

**Charger under heavy load** — current and power rise, temperature climbs on the
charger's much shorter thermal time constant, voltage sags slightly under the
extra draw, and the power factor moves with the load as a switch-mode supply's
does (about 0.48 at no load, about 0.95 loaded).

Nothing calls `random`. Every value is a pure function of `(key, index)`, so the
same second of simulated time always produces the same reading — which is what
makes the stored history and the live stream one continuous series.

### Commissioned estate

24 devices: 14 laptops (`LAP-001`…`LAP-014`) and 10 mobile chargers
(`CHR-001`…`CHR-010`). No other class is generated.

| Laptop components | Mobile Charger components |
| --- | --- |
| Battery | Power Module |
| CPU | Transformer |
| Cooling System | USB-C Output |
| Power Adapter Port | Protection Circuit |
| RAM | Cable |
| SSD | Thermal Sensor |

Component lives are stated in days of continuous service and come from the real
figures for the hardware — a laptop battery at 900 days is roughly 1,000 charge
cycles; a charger cable at 800 days is flex fatigue at the strain relief. Every
wear rate downstream is derived from those numbers.

### Injected faults

Eleven units carry scheduled excursions — thermal runaway, adapter sag, cable
faults, connector drop-outs — so the detection, root-cause and maintenance
modules have genuine events to work with. The schedule is a function of the asset
id and the clock, so the same fault happens at the same moment in every run.

---

## Business logic

All of it is in `services/derive.py` and the services around it.

- **Health score** — `100 − 82·wear^1.18`, less any live thermal or electrical
  penalty. Convex, because the first twenty wear points cost little health and
  the last twenty cost a great deal.
- **Condition bands** — 95+ Healthy, 80–94 Good, 65–79 Warning, below 65 Critical.
- **Remaining useful life** — distance to the failure boundary over the
  component's own smoothed wear rate, blended with a regression on observed
  health and then ratcheted: the published figure only ever tightens.
- **Failure probability** — a logistic on projected wear inside a 30-day horizon,
  also ratcheted, so it only ever rises.
- **Maintenance priority** — probability and remaining life weighted by business
  criticality, so the same risk on a high-criticality unit outranks it on a low
  one.
- **Availability** — measured uptime, not a health function.
- **Performance** — condition against nominal capability, with thermal throttling
  above 85% of the device's ceiling.
- **Quality** — first-pass success degraded by condition and recent anomaly load.
- **OEE** — availability × performance × quality, and the loss cascade that
  explains the gap.
- **Risk tier** — condition, projected failure probability and open critical
  alarms. An offline device is never rated better than medium: its condition is
  unknown, and unknown is not the same as good.

Because every module reads the same functions against the same wear, two screens
cannot disagree about the same device. `tests/test_consistency.py` proves it by
ageing the estate and asserting that health, OEE, remaining life, failure
probability and fleet ranking all moved the way they must.

---

## Anomaly detection

Two independent judgements are combined.

A **rule** decides whether an event is raised. Readings are compared with limits
held on the device's own profile — a 35 W charger and a 96 W laptop are each
judged against their own rating — and a breach must persist before it is
reported. An event clears only once the reading has returned inside the limit
with 3% margin and stayed there. That hysteresis is why the journal reads as a
list of faults rather than a list of samples.

A **model** — an isolation forest fitted per device against its own recent
behaviour — scores how unusual the reading is. It cannot raise an event on its
own, because an operator needs to know which limit broke, but it is stored with
every event and raises the confidence when it agrees.

| Code | Anomaly | Channel |
| --- | --- | --- |
| ANO-1001 | Voltage High | voltage |
| ANO-1002 | Voltage Low | voltage |
| ANO-1003 | Current Spike | current |
| ANO-1004 | Power Surge | active power |
| ANO-1005 | Power Factor Low | power factor |
| ANO-1006 | Temperature Exceeded | temperature |
| ANO-1007 | Frequency Deviation | frequency |
| ANO-1008 | Energy Consumption Spike | energy rate |
| ANO-1009 | Communication Lost | device status |

Impossible anomalies are not generated. Power factor is only judged once the
device is drawing a meaningful fraction of its rating, because the figure is
meaningless at no load. An offline device raises communication loss and nothing
else, and any electrical or thermal event already open on it is closed the moment
it goes dark — the platform can no longer observe that limit, so it stops
asserting it.

---

## Machine learning

`scikit-learn`, used where it earns its place:

- **`IsolationForest`**, one per asset, fitted on its own recent window and
  refitted every five minutes. Produces the continuous anomaly score. Each device
  is scored against itself, because a charger drawing 2 A is unremarkable and the
  laptop beside it drawing 2 A is not.
- **`LinearRegression`** on observed health against time, extrapolated to the
  failure threshold. Blended with the analytical wear-rate projection in
  proportion to how well the fit explains its own history, and capped so it never
  fully displaces the physical model.

Both degrade gracefully: if scikit-learn is unavailable the scorer falls back to
a robust median-absolute-deviation distance and the degradation model to a least
squares fit. `/api/system/status` reports which backend is actually in use.

---

## Database

`intelora_db`, created automatically on first start.

| Table | Contents |
| --- | --- |
| `users` | Platform accounts |
| `assets` | The asset register — the six displayed fields plus engineering ratings |
| `asset_components` | Serviceable parts and their accumulated wear |
| `devices` | MIKOS sensors bound to assets: serial, firmware, gateway, relay |
| `telemetry` | Every reading, at every resolution |
| `alerts` | Alert lifecycle — ownership, response target, acknowledgement |
| `anomaly_detection` | Detection results — what broke, by how much, with what score |
| `predictive_maintenance` | Per-component prediction snapshots |
| `asset_performance` | Availability, performance, quality, MTBF, MTTR |
| `oee` | Effectiveness snapshots, per asset and for the fleet |
| `ai_insights` | Generated narratives, per module |

`asset_components` is not in the original ten. It exists because wear must live
somewhere addressable for the per-component queries to be answerable, and folding
it into `assets` would put six mutable floats into the register the interface
reads.

### History

30 days are generated on first start by running the same simulator forward from a
month ago, so the stored past and the live present are one continuous series.
Sampling is deliberately not per-second:

| Range | Resolution | Rows per device |
| --- | --- | --- |
| beyond 7 days | hourly | ~552 |
| 7 days to 24 hours | quarter-hourly | ~576 |
| inside 24 hours | per minute | ~1,440 |
| live | per second | 3,600 per hour |

A month of one-second readings would be about 62 million rows per device, which
is neither storable on a workstation nor useful — no question asked of last
month's data needs one-second resolution. Every row records the resolution that
produced it, and `/api/telemetry/history` picks the coarsest one that still
answers the range requested.

Live per-second rows are pruned after 24 hours by the retention task. The
down-sampled history is never pruned.

### State that survives a restart

Component wear and the cumulative meters — energy, runtime, relay operations —
are written back on shutdown and restored on start. Wear must survive because a
restart that rejuvenated the estate would push every published remaining-life
figure outward, which is exactly what the ratchet exists to prevent. The meters
must survive because consumption over a range is derived as (max − min) across
the window: a meter that reset to zero would make the window containing the
restart read as though the entire meter had been consumed inside it.

### Querying

```
GET /api/telemetry/history?asset_id=LAP-003&hours=24
GET /api/telemetry/history?asset_id=CHR-006&hours=168&resolution=quarter
GET /api/telemetry/history?component=Battery&hours=720
GET /api/telemetry/history?start=2026-07-01T00:00:00Z&end=2026-07-08T00:00:00Z
```

Telemetry is measured at the device input, so `component` filters to the assets
carrying that part rather than isolating a signal the sensor cannot separate.

---

## Background tasks

| Loop | Interval | Work |
| --- | --- | --- |
| tick | 1 s | Advance the estate, judge every reading, buffer and store it, push to websockets |
| analytics | 30 s | Refit both models, recompute predictions and effectiveness, write snapshots and insights |
| retention | 15 min | Prune raw telemetry past the window, bound the snapshot tables |

Database work runs in a worker thread so the synchronous session never blocks the
event loop. The tick loop schedules against a fixed origin rather than sleeping a
fixed interval, so a slow write does not push every later tick further behind; if
it falls far enough behind, the schedule is re-based instead of replaying a
backlog of seconds that never happened.

---

## Connecting the frontend

The React application already exists at the repository root and is not modified
by this backend. To point it at the API, set its base URL to
`http://localhost:8000` and read the endpoints above; the response shapes mirror
the frontend's existing domain types, so the change is in the data layer and not
in any component, page, layout or route.

CORS already allows the Vite dev server (`5173`) and preview (`4173`). Add
origins in `.env` via `CORS_ORIGINS`.

---

## Tests

```bat
venv\Scripts\python.exe -m pytest tests -q
```

- `test_simulator.py` — physical invariants: the power triangle closes, active
  power equals V·I·PF, channels move smoothly rather than jumping, energy and
  runtime only increase, wear never decreases, offline devices publish no load.
- `test_consistency.py` — cross-module agreement: health is identical everywhere
  it is reported, KPI counts partition the estate, OEE is the product of its own
  factors, and ageing the weakest device moves health, effectiveness, remaining
  life, failure probability and fleet rank in the directions they must move.
- `test_api.py` — every endpoint responds, and the figures in one response agree
  with the figures in another.

---

## Configuration reference

See `.env.example`. The values worth knowing:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TICK_INTERVAL_SECONDS` | `1.0` | Sensor publication interval |
| `PERSIST_EVERY_N_TICKS` | `1` | Store every generated reading |
| `WEAR_TIME_SCALE` | `60` | Live degradation clock — one second of watching ages the estate by one minute. The back-fill always runs at true rate |
| `RAW_RETENTION_HOURS` | `24` | How long per-second rows are kept |
| `HISTORY_DAYS` | `30` | Depth of the generated history |
| `ANALYTICS_INTERVAL_SECONDS` | `30` | Derived-state recomputation cadence |
| `ML_ENABLED` | `true` | Isolation forest and degradation regression |
| `CORS_ORIGINS` | Vite dev and preview | Comma-separated allowed origins |
