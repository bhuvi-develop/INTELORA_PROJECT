import ssl
import socket
import threading
import time
from collections import deque
from datetime import datetime, timezone

from app.logging_config import get_logger
from app.services.mqtt_config import mqtt_profile_manager, MqttProfile
from app.services.payload_parser import parse_mqtt_payload

logger = get_logger(__name__)

try:
    import paho.mqtt.client as mqtt
    PAHO_AVAILABLE = True
except ImportError:
    PAHO_AVAILABLE = False
    logger.warning("paho-mqtt unavailable. MQTT Listener will run in degraded mode.")

class MqttListener:
    def __init__(self):
        self.queue = deque(maxlen=1000)
        self.connected = False
        self.messages_sec = 0
        self.last_msg_at = None
        self._msg_counter = 0
        self.client = None
        self._stop_event = threading.Event()
        self._metrics_thread = None
        self._lock = threading.RLock()
        self.last_error = ""

    def start(self):
        with self._lock:
            if self.client:
                return

            self._stop_event.clear()
            active_profile = mqtt_profile_manager.get_active_profile()

            if PAHO_AVAILABLE:
                self._connect_client(active_profile)
            else:
                self.connected = False
                self.last_error = "paho-mqtt library not installed on backend"

            if not self._metrics_thread or not self._metrics_thread.is_alive():
                self._metrics_thread = threading.Thread(target=self._metrics_loop, daemon=True)
                self._metrics_thread.start()

    def _connect_client(self, profile: MqttProfile):
        try:
            client_id = profile.client_id or f"intelora_backend_{int(time.time()*1000)}"
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=client_id, clean_session=True)
            except Exception:
                self.client = mqtt.Client(client_id=client_id, clean_session=True)

            if profile.username and profile.password:
                self.client.username_pw_set(profile.username, profile.password)

            if profile.use_tls:
                cert_reqs = ssl.CERT_REQUIRED if profile.validate_cert else ssl.CERT_NONE
                self.client.tls_set(cert_reqs=cert_reqs)
                if not profile.validate_cert:
                    self.client.tls_insecure_set(True)

            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            logger.info(f"Connecting to MQTT broker {profile.name} at {profile.host}:{profile.port}...")
            self.client.connect_async(profile.host, profile.port, profile.keepalive)
            self.client.loop_start()
            self.last_error = ""
        except Exception as e:
            self.connected = False
            self.last_error = str(e)
            logger.error(f"MQTT connection attempt failed for {profile.name}: {e}")

    def stop(self):
        with self._lock:
            self._stop_event.set()
            if self.client:
                try:
                    self.client.loop_stop()
                    self.client.disconnect()
                except Exception as e:
                    logger.warning(f"Error during MQTT client disconnect: {e}")
                self.client = None
            self.connected = False

    def reconnect_to_profile(self, profile_name: str) -> bool:
        with self._lock:
            profile = mqtt_profile_manager.set_active_profile(profile_name)
            if not profile:
                logger.error(f"Cannot reconnect to profile {profile_name}: not found")
                return False

            self.stop()
            self._stop_event.clear()
            if PAHO_AVAILABLE:
                self._connect_client(profile)
                return True
            return False

    def test_connection(self, host: str, port: int, timeout: float = 3.0) -> dict:
        """Test TCP socket reachability to an MQTT host/port."""
        try:
            s = socket.create_connection((host, port), timeout=timeout)
            s.close()
            return {"ok": True, "message": f"Successfully reached {host}:{port}"}
        except Exception as e:
            return {"ok": False, "message": f"Could not reach {host}:{port} - {str(e)}"}

    def _on_connect(self, client, userdata, flags, rc, *args):
        profile = mqtt_profile_manager.get_active_profile()
        if rc == 0 or (hasattr(rc, "is_failure") and not rc.is_failure):
            self.connected = True
            self.last_error = ""
            client.subscribe(profile.topic, qos=profile.qos)
            logger.info(f"Successfully connected and subscribed to {profile.topic} on broker {profile.host}")
        else:
            self.connected = False
            error_msg = f"Broker connection refused with code {rc}"
            self.last_error = error_msg
            logger.error(error_msg)

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            logger.warning(f"Unexpected disconnect from MQTT broker (code {rc})")
            self.last_error = f"Unexpected disconnect (code {rc})"

    def _on_message(self, client, userdata, msg):
        try:
            profile = mqtt_profile_manager.get_active_profile()
            payload_str = msg.payload.decode('utf-8')
            source_tag = f"Live MQTT ({profile.name})"
            readings = parse_mqtt_payload(msg.topic, payload_str, source_tag=source_tag)
            for reading in readings:
                self.queue.append(reading)
                self._msg_counter += 1
                self.last_msg_at = datetime.now(timezone.utc)
            logger.info("Received MQTT message on %s: parsed %d readings", msg.topic, len(readings))
        except Exception as e:
            logger.error(f"Error handling MQTT message on {msg.topic}: {e}")

    def _metrics_loop(self):
        while not self._stop_event.is_set():
            self.messages_sec = self._msg_counter
            self._msg_counter = 0
            time.sleep(1.0)

    def pop_all(self):
        batch = list(self.queue)
        self.queue.clear()
        return batch

mqtt_listener = MqttListener()
