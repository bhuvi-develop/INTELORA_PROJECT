"""The asset hierarchy.

    Enterprise → Portfolio → Site → Floor → Zone → Asset → Sensor

A **read model**, derived from the register rather than stored. This matters, and
is the one place APM deliberately does not do what the obvious implementation
would do.

The platform's asset record is explicit that it carries six fields and no
location: there is no site, floor or zone column on `assets`, and the frontend
domain model states the same in as many words. Adding those columns would mean
inventing location data for twenty-four devices and writing it into a table three
other modules read — precisely the kind of change that is out of APM's remit.

So the hierarchy is *projected* from attributes that already exist. Every level
maps onto something the register genuinely knows:

    Enterprise  the estate itself
    Portfolio   device class — the unit the platform already rolls up by
    Site        brand — how the estate is actually procured and supported
    Floor       model family
    Zone        criticality class, which is how work is actually queued
    Asset       the asset record
    Sensor      the MIKOS sensor bound to it

The shape is therefore real, navigable and consistent with every other rollup in
the platform, and it costs no schema change. When the register grows real location
columns, `_LEVEL_KEYS` is the only thing that has to change — every consumer of
this module is written against the level names, not against what fills them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.simulator import AssetState

#: The level names, root first. Fixed by specification — this module maintains the
#: hierarchy, it does not redefine it.
LEVELS: tuple[str, ...] = (
    "enterprise",
    "portfolio",
    "site",
    "floor",
    "zone",
    "asset",
    "sensor",
)

ENTERPRISE_NAME = "INTELORA Estate"


@dataclass
class HierarchyNode:
    node_id: str
    level: str
    name: str
    #: Asset ids beneath this node, at any depth.
    asset_ids: list[str] = field(default_factory=list)
    children: list["HierarchyNode"] = field(default_factory=list)

    # Rolled-up figures, filled once the APM records are known.
    assets: int = 0
    health_index: float = 0.0
    criticality_score: float = 0.0
    risk_score: float = 0.0
    availability_pct: float = 0.0
    downtime_hours: float = 0.0
    cost_exposure: float = 0.0
    open_work_orders: int = 0
    critical_assets: int = 0

    def as_dict(self, depth: int = 99) -> dict:
        payload = {
            "node_id": self.node_id,
            "level": self.level,
            "name": self.name,
            "assets": self.assets,
            "health_index": self.health_index,
            "criticality_score": self.criticality_score,
            "risk_score": self.risk_score,
            "availability_pct": self.availability_pct,
            "downtime_hours": self.downtime_hours,
            "cost_exposure": self.cost_exposure,
            "open_work_orders": self.open_work_orders,
            "critical_assets": self.critical_assets,
            "asset_ids": list(self.asset_ids),
        }
        payload["children"] = (
            [child.as_dict(depth - 1) for child in self.children] if depth > 0 else []
        )
        return payload


def _model_family(model: str) -> str:
    """Model family — the model name without its generation or capacity suffix.

    'ThinkPad T14s Gen 3' and 'ThinkPad X1 Carbon Gen 11' are different families;
    'Latitude 5420' and 'Latitude 7440' are the same one. Two tokens is what
    separates them across this catalogue.
    """
    tokens = model.split()
    return " ".join(tokens[:2]) if len(tokens) >= 2 else model


def _slug(value: str) -> str:
    return "".join(character if character.isalnum() else "-" for character in value.lower()).strip("-")


def strip_brand_name(name: str, brand: str | None = None) -> str:
    if brand and name.lower().startswith(brand.lower()):
        trimmed = name[len(brand):].strip()
        if trimmed:
            return trimmed
    known_brands = [
        "Baseus", "Samsung", "Ugreen", "Anker", "Belkin", "Apple", "Dell", "HP", "Lenovo",
        "Daikin", "Voltas", "Blue Star", "LG", "Mitsubishi", "Carrier", "Hitachi", "Panasonic", "Lloyd", "Godrej"
    ]
    for b in known_brands:
        if name.lower().startswith(b.lower()):
            trimmed = name[len(b):].strip()
            if trimmed:
                return trimmed
    return name


def build(
    states: list[AssetState],
    criticality_labels: dict[str, str] | None = None,
) -> HierarchyNode:
    """Assemble the hierarchy over the current register.

    `criticality_labels` maps asset id to the criticality class the APM model
    computed. Where it is absent the register's assigned label is used, so the tree
    is still correct before the first analytics pass has run.
    """
    labels = criticality_labels or {}
    root = HierarchyNode(node_id="enterprise", level="enterprise", name=ENTERPRISE_NAME)
    index: dict[str, HierarchyNode] = {"enterprise": root}

    for state in sorted(states, key=lambda entry: entry.asset_id):
        seed = state.seed
        zone_label = labels.get(state.asset_id, seed.criticality)

        path = [
            ("portfolio", seed.category),
            ("site", seed.brand),
            ("floor", _model_family(seed.model)),
            ("zone", f"{zone_label} criticality"),
        ]

        parent = root
        node_id = "enterprise"
        for level, name in path:
            node_id = f"{node_id}/{_slug(name)}"
            node = index.get(node_id)
            if node is None:
                node = HierarchyNode(node_id=node_id, level=level, name=name)
                index[node_id] = node
                parent.children.append(node)
            parent = node

        asset_name = strip_brand_name(seed.asset_name, seed.brand)
        asset_node = HierarchyNode(
            node_id=f"{node_id}/{state.asset_id}",
            level="asset",
            name=asset_name,
            asset_ids=[state.asset_id],
        )
        asset_node.children.append(
            HierarchyNode(
                node_id=f"{asset_node.node_id}/{state.device_uid}",
                level="sensor",
                name=state.device_uid,
                asset_ids=[state.asset_id],
            )
        )
        parent.children.append(asset_node)
        index[asset_node.node_id] = asset_node

    _propagate_asset_ids(root)
    return root


def _propagate_asset_ids(node: HierarchyNode) -> list[str]:
    """Push every descendant's asset ids up to the branch nodes."""
    if node.level in ("asset", "sensor"):
        return list(node.asset_ids)

    collected: list[str] = []
    for child in node.children:
        collected.extend(_propagate_asset_ids(child))

    # De-duplicated because the asset and its sensor both report the same id.
    node.asset_ids = sorted(set(collected))
    return node.asset_ids


def roll_up(node: HierarchyNode, records: dict[str, dict]) -> None:
    """Fold the APM records into every level of the tree, in place.

    Means are unweighted within a level but computed over that level's own assets,
    so a site with two devices is not diluted by one with fourteen. Money and
    counts are summed, because they are additive and a mean of them would be a
    figure nobody asked for.
    """
    for child in node.children:
        roll_up(child, records)

    scoped = [records[asset_id] for asset_id in node.asset_ids if asset_id in records]
    node.assets = len(scoped)

    if not scoped:
        return

    count = len(scoped)
    node.health_index = round(sum(entry["health_index"] for entry in scoped) / count, 1)
    node.criticality_score = round(sum(entry["criticality_score"] for entry in scoped) / count, 1)
    node.risk_score = round(sum(entry["risk_score"] for entry in scoped) / count, 1)
    node.availability_pct = round(sum(entry["availability_pct"] for entry in scoped) / count, 1)
    node.downtime_hours = round(sum(entry["downtime_hours"] for entry in scoped), 3)
    node.cost_exposure = round(sum(entry["cost_exposure"] for entry in scoped), 2)
    node.open_work_orders = sum(entry["open_work_orders"] for entry in scoped)
    node.critical_assets = sum(1 for entry in scoped if entry["risk_tier"] == "critical")


def flatten(node: HierarchyNode, levels: tuple[str, ...] | None = None) -> list[HierarchyNode]:
    """Every node at or below this one, optionally filtered to certain levels."""
    wanted = levels or LEVELS
    out: list[HierarchyNode] = [node] if node.level in wanted else []
    for child in node.children:
        out.extend(flatten(child, wanted))
    return out


def find(node: HierarchyNode, node_id: str) -> HierarchyNode | None:
    if node.node_id == node_id:
        return node
    for child in node.children:
        found = find(child, node_id)
        if found is not None:
            return found
    return None
