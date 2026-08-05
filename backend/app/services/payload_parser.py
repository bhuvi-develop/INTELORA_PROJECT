import json
import math
import re
from datetime import datetime, timezone
from typing import List, Dict, Any
from app.logging_config import get_logger
from app.services.simulator import Reading

logger = get_logger(__name__)

# Valid estate asset IDs for mapping safety
ESTATE_ASSET_IDS = [f"LAP-{i:03d}" for i in range(1, 15)] + [f"CHR-{i:03d}" for i in range(1, 11)]

def _extract_val(data: dict, keys: list, default=None):
    """Utility to check multiple key aliases in dictionary."""
    for k in keys:
        if k in data and data[k] is not None:
            return data[k]
    return default

import hashlib

def extract_asset_id(topic: str, data: dict) -> str:
    """Extract or deterministically map asset ID from payload or topic."""
    # 1. Try explicit asset_id / assetId in payload
    payload_id = _extract_val(data, ["asset_id", "assetId"])
    if payload_id and str(payload_id).strip():
        pid = str(payload_id).strip()
        if pid in ESTATE_ASSET_IDS:
            return pid
        match = re.search(r"(LAP-\d{3}|CHR-\d{3})", pid, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    # 2. Try topic extraction
    topic_match = re.search(r"(LAP-\d{3}|CHR-\d{3})", topic, re.IGNORECASE)
    if topic_match:
        return topic_match.group(1).upper()

    parts = topic.split('/')
    for p in parts:
        if p.upper() in ESTATE_ASSET_IDS:
            return p.upper()

    # 3. Deterministically map device_uid (e.g. "0104120000000001") to a unique stable asset ID
    device_uid = str(_extract_val(data, ["device_uid", "sender_uid", "uid", "mac", "serial"], default=""))
    if device_uid:
        h_val = int(hashlib.md5(device_uid.encode('utf-8')).hexdigest(), 16)
        
        # Determine category based on device_uid structure if possible
        # e.g. "0104..." -> Mobile Charger (04), "0102..." -> Laptop (02)
        if len(device_uid) >= 4 and device_uid[2:4] == "04":
            idx = (h_val % 10) + 1
            return f"CHR-{idx:03d}"
        elif len(device_uid) >= 4 and device_uid[2:4] == "02":
            idx = (h_val % 14) + 1
            return f"LAP-{idx:03d}"
            
        # Fallback if structure is unknown
        if "voltage" in data or "current" in data or "power" in data or "active_power" in data:
            idx = (h_val % 10) + 1
            return f"CHR-{idx:03d}"
        else:
            idx = (h_val % 14) + 1
            return f"LAP-{idx:03d}"

    return "LAP-001"

def _flatten_payload_items(raw: Any, topic: str) -> List[Dict[str, Any]]:
    """Unroll nested MQTT JSON structures (payload -> data -> device_data)."""
    items = []
    if isinstance(raw, dict):
        parent_meta = {
            "hmac": raw.get("hmac"),
            "sender_uid": raw.get("sender_uid"),
            "device_uid": raw.get("device_uid")
        }
        
        # Structure 1: {"payload": {"sender_uid": "...", "data": [...]}}
        if "payload" in raw and isinstance(raw["payload"], dict):
            p_obj = raw["payload"]
            p_meta = {**parent_meta, "sender_uid": p_obj.get("sender_uid", parent_meta["sender_uid"])}
            
            if "data" in p_obj and isinstance(p_obj["data"], list):
                for d_item in p_obj["data"]:
                    if isinstance(d_item, dict):
                        d_meta = {**p_meta, "device_uid": d_item.get("device_uid", p_meta["device_uid"])}
                        
                        if "device_data" in d_item:
                            dd = d_item["device_data"]
                            if isinstance(dd, list):
                                for entry in dd:
                                    if isinstance(entry, dict):
                                        items.append({**d_meta, **entry})
                            elif isinstance(dd, dict):
                                items.append({**d_meta, **dd})
                        else:
                            items.append({**d_meta, **d_item})
            elif "data" in p_obj and isinstance(p_obj["data"], dict):
                items.append({**p_meta, **p_obj["data"]})
            else:
                items.append({**p_meta, **p_obj})
        # Structure 2: {"data": [...]} or flat dictionary
        elif "data" in raw and isinstance(raw["data"], list):
            for d_item in raw["data"]:
                if isinstance(d_item, dict):
                    items.append({**parent_meta, **d_item})
        else:
            items.append(raw)
    elif isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict):
                items.append(entry)

    return items

def parse_mqtt_payload(topic: str, payload_str: str, source_tag: str = "Live MQTT") -> List[Reading]:
    """Parse raw MQTT payload into a list of standardized Reading objects."""
    readings: List[Reading] = []
    try:
        raw = json.loads(payload_str)
        flat_items = _flatten_payload_items(raw, topic)

        for data in flat_items:
            if not isinstance(data, dict):
                continue

            # Parse timestamp
            ts_val = _extract_val(data, ["timestamp", "ts", "time", "date"])
            if ts_val:
                try:
                    if isinstance(ts_val, (int, float)):
                        ts = datetime.fromtimestamp(ts_val, tz=timezone.utc)
                    else:
                        ts = datetime.fromisoformat(str(ts_val).replace("Z", "+00:00"))
                except Exception:
                    ts = datetime.now(timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            asset_id = extract_asset_id(topic, data)
            device_uid = str(_extract_val(data, ["device_uid", "sender_uid", "uid", "mac", "serial"], default=f"uid_{asset_id.lower()}"))
            sender_uid_raw = data.get("sender_uid")
            sender_uid = str(sender_uid_raw) if sender_uid_raw else None

            # Record present parameter keys from raw payload
            present_params = []
            if _extract_val(data, ["voltage", "v", "V", "volts", "voltage_v"]) is not None:
                present_params.append("voltage")
            if _extract_val(data, ["current", "i", "I", "amps", "current_a"]) is not None:
                present_params.append("current")
            if _extract_val(data, ["active_power", "power", "p", "P", "watts", "w", "active_w"]) is not None:
                present_params.append("active_power")
            if _extract_val(data, ["apparent_power", "s", "S", "va"]) is not None:
                present_params.append("apparent_power")
            if _extract_val(data, ["reactive_power", "q", "Q", "var"]) is not None:
                present_params.append("reactive_power")
            if _extract_val(data, ["power_factor", "pf", "PF"]) is not None:
                present_params.append("power_factor")
            if _extract_val(data, ["frequency", "freq", "hz", "Hz"]) is not None:
                present_params.append("frequency")
            if _extract_val(data, ["energy_kwh", "energy", "kwh", "kWh"]) is not None:
                present_params.append("energy_kwh")
            if _extract_val(data, ["temperature", "temp", "t", "T", "temperature_c"]) is not None:
                present_params.append("temperature")

            # Electrical & thermal parameter extractions
            current_raw = _extract_val(data, ["current", "i", "I", "amps", "current_a"])
            current = float(current_raw) if current_raw is not None else 0.0

            voltage_raw = _extract_val(data, ["voltage", "v", "V", "volts", "voltage_v"])
            voltage = float(voltage_raw) if voltage_raw is not None else (230.0 if current > 0 else 0.0)

            active_power_raw = _extract_val(data, ["active_power", "power", "p", "P", "watts", "w", "active_w"])
            active_power = float(active_power_raw) if active_power_raw is not None else (voltage * current * 0.95 if current > 0 else 0.0)

            apparent_power_raw = _extract_val(data, ["apparent_power", "s", "S", "va", "va_power"])
            if apparent_power_raw is not None:
                apparent_power = float(apparent_power_raw)
            else:
                apparent_power = max(active_power, voltage * current)

            pf_raw = _extract_val(data, ["power_factor", "pf", "PF"])
            if pf_raw is not None:
                power_factor = float(pf_raw)
            else:
                power_factor = (active_power / apparent_power) if apparent_power > 0 else (0.95 if current > 0 else 0.0)
                power_factor = max(0.0, min(1.0, power_factor))

            reactive_power_raw = _extract_val(data, ["reactive_power", "q", "Q", "var", "var_power"])
            if reactive_power_raw is not None:
                reactive_power = float(reactive_power_raw)
            else:
                reactive_power = math.sqrt(max(0.0, apparent_power**2 - active_power**2))

            temp_raw = _extract_val(data, ["temperature", "temp", "t", "T", "temperature_c"])
            temperature = float(temp_raw) if temp_raw is not None else (35.0 if current > 0 else 25.0)

            frequency = float(_extract_val(data, ["frequency", "freq", "hz", "Hz", "f"], 50.0 if current > 0 else 0.0))
            energy_kwh = float(_extract_val(data, ["energy_kwh", "energy", "kwh", "kWh"], 0.0))
            runtime_hours = float(_extract_val(data, ["runtime_hours", "runtime", "hours"], 0.0))

            relay_status = str(_extract_val(data, ["relay_status", "relay"], "Closed" if current > 0 else "Open"))
            if relay_status.lower() in ["1", "true", "on", "closed"]:
                relay_status = "Closed"
            elif relay_status.lower() in ["0", "false", "off", "open"]:
                relay_status = "Open"

            relay_operations = int(_extract_val(data, ["relay_operations", "relay_ops", "switches"], 0))

            device_status = str(_extract_val(data, ["device_status", "status"], "Online" if current > 0 else "Online"))
            if device_status.capitalize() not in ["Online", "Standby", "Offline"]:
                device_status = "Online"

            health_score = float(_extract_val(data, ["health_score", "health"], 100.0))
            load_state = str(_extract_val(data, ["load_state", "state", "mode"], "Active" if current > 0 else "Idle"))

            readings.append(
                Reading(
                    asset_id=asset_id,
                    device_uid=device_uid,
                    ts=ts,
                    voltage=voltage,
                    current=current,
                    active_power=active_power,
                    apparent_power=apparent_power,
                    reactive_power=reactive_power,
                    power_factor=power_factor,
                    frequency=frequency,
                    energy_kwh=energy_kwh,
                    runtime_hours=runtime_hours,
                    temperature=temperature,
                    relay_status=relay_status,
                    relay_operations=relay_operations,
                    device_status=device_status,
                    health_score=health_score,
                    load_state=load_state,
                    resolution="second",
                    source=source_tag,
                    present_parameters=present_params,
                    sender_uid=sender_uid
                )
            )

    except Exception as e:
        logger.warning(f"Failed to parse MQTT payload on {topic}: {e}")

    return readings
