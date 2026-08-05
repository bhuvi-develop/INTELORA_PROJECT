import json
import os
from typing import Dict, Any, List
from pydantic import BaseModel
from app.logging_config import get_logger

logger = get_logger(__name__)

PROFILES_FILE = os.path.join(os.path.dirname(__file__), "..", "mqtt_profiles.json")

class MqttProfile(BaseModel):
    name: str
    protocol: str = "mqtt://"
    host: str
    port: int = 1883
    username: str = ""
    password: str = ""
    validate_cert: bool = True
    use_tls: bool = False
    topic: str = "#"
    qos: int = 1
    keepalive: int = 60
    client_id: str = "mikos_backend"

DEFAULT_PROFILES: Dict[str, Dict[str, Any]] = {
    "HYD VM": {
        "name": "HYD VM",
        "protocol": "mqtt://",
        "host": "172.176.255.143",
        "port": 1883,
        "username": "",
        "password": "",
        "validate_cert": True,
        "use_tls": False,
        "topic": "#",
        "qos": 1,
        "keepalive": 60,
        "client_id": "mikos_backend_hyd"
    },
    "test.mosquitto.org": {
        "name": "test.mosquitto.org",
        "protocol": "mqtt://",
        "host": "test.mosquitto.org",
        "port": 1883,
        "username": "",
        "password": "",
        "validate_cert": False,
        "use_tls": False,
        "topic": "#",
        "qos": 1,
        "keepalive": 60,
        "client_id": "mikos_backend_mosquitto"
    }
}

class MqttProfileManager:
    def __init__(self):
        self.profiles: Dict[str, MqttProfile] = {}
        self.active_profile_name: str = "HYD VM"
        self._load()

    def _load(self):
        loaded_data = None
        if os.path.exists(PROFILES_FILE):
            try:
                with open(PROFILES_FILE, "r", encoding="utf-8") as f:
                    loaded_data = json.load(f)
            except Exception as e:
                logger.error(f"Error reading MQTT profiles file: {e}")

        if loaded_data and "profiles" in loaded_data:
            self.active_profile_name = loaded_data.get("active_profile", "HYD VM")
            for name, item in loaded_data["profiles"].items():
                try:
                    # Update default topic to # if stale
                    if item.get("topic") == "intelora/mikos/telemetry/#":
                        item["topic"] = "#"
                    self.profiles[name] = MqttProfile(**item)
                except Exception as ex:
                    logger.warning(f"Skipping invalid profile {name}: {ex}")

        # Ensure default profiles exist if missing
        for def_name, def_data in DEFAULT_PROFILES.items():
            if def_name not in self.profiles:
                self.profiles[def_name] = MqttProfile(**def_data)

        if self.active_profile_name not in self.profiles and self.profiles:
            self.active_profile_name = list(self.profiles.keys())[0]

    def _save(self):
        data = {
            "active_profile": self.active_profile_name,
            "profiles": {name: p.model_dump() for name, p in self.profiles.items()}
        }
        try:
            with open(PROFILES_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save MQTT profiles: {e}")

    def get_active_profile(self) -> MqttProfile:
        if self.active_profile_name in self.profiles:
            return self.profiles[self.active_profile_name]
        return list(self.profiles.values())[0]

    def get_all_profiles(self) -> List[MqttProfile]:
        return list(self.profiles.values())

    def save_profile(self, profile: MqttProfile) -> MqttProfile:
        self.profiles[profile.name] = profile
        self._save()
        return profile

    def delete_profile(self, name: str) -> bool:
        if name in self.profiles:
            del self.profiles[name]
            if self.active_profile_name == name:
                self.active_profile_name = list(self.profiles.keys())[0] if self.profiles else ""
            self._save()
            return True
        return False

    def set_active_profile(self, name: str) -> MqttProfile | None:
        if name in self.profiles:
            self.active_profile_name = name
            self._save()
            return self.profiles[name]
        return None

# Global instance
mqtt_profile_manager = MqttProfileManager()

# Legacy compatibility wrapper
class LegacySettingsWrapper:
    @property
    def mqtt_broker(self) -> str:
        return mqtt_profile_manager.get_active_profile().host

    @property
    def mqtt_port(self) -> int:
        return mqtt_profile_manager.get_active_profile().port

    @property
    def mqtt_topic(self) -> str:
        return mqtt_profile_manager.get_active_profile().topic

    @property
    def mqtt_qos(self) -> int:
        return mqtt_profile_manager.get_active_profile().qos

    @property
    def mqtt_keepalive(self) -> int:
        return mqtt_profile_manager.get_active_profile().keepalive

mqtt_settings = LegacySettingsWrapper()
