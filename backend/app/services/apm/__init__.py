"""Asset Performance Management.

A package rather than a flat module because the one hard constraint on this
work is ownership: everything APM calculates lives under this directory, and
nothing under this directory calculates anything owned by Anomaly Detection,
Predictive Maintenance or OEE. The boundary is auditable by listing the folder.

APM is a consumer. It reads condition and remaining life from PdM, alarm state
from AD, and the register and meters from Platform Core, then answers the
questions those modules deliberately do not: how critical is this asset, what
does its condition cost, what work should be raised against it, and in what
order.

Layers, bottom up:

    config        every tunable the module owns, mutable at runtime
    hierarchy     the Enterprise → Sensor read model over the register
    criticality   the six-factor configurable consequence model
    reliability   availability, MTBF, MTTR, failure rate, downtime
    health_index  the APM composite over AD + PdM + Platform Core
    cost          the money model: spend, downtime cost, exposure
    risk          risk score, effective age, repair-vs-replace, actions
    work_orders   the work order lifecycle and its outcome journal
    apm_service   the orchestrator that assembles one APM record per asset
"""

from __future__ import annotations
