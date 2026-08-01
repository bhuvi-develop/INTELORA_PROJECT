"""Runtime configuration.

Every tunable the backend has is declared here and sourced from the environment,
so the same image runs against a developer's local PostgreSQL and against a
deployed instance without a code change.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = BACKEND_ROOT / "logs"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Application ──────────────────────────────────────────────────────
    app_name: str = "INTELORA Backend"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    api_prefix: str = "/api"

    host: str = "0.0.0.0"
    port: int = 8000

    # ── PostgreSQL ───────────────────────────────────────────────────────
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "intelora_db"

    # Full URL wins when supplied; otherwise it is assembled from the parts.
    database_url: str | None = None

    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # ── Mock sensor engine ───────────────────────────────────────────────
    # The MIKOS sensor reports once per second.
    tick_interval_seconds: float = 1.0

    # Persist every Nth tick. 1 stores every generated record, which is what the
    # specification asks for; raising it trades resolution for write volume on a
    # constrained machine.
    persist_every_n_ticks: int = 1

    # Rolling in-memory window per asset, used by the live APIs and the models
    # so a chart request never has to touch the database.
    live_window_samples: int = 900

    # Degradation clock for the LIVE stream only.
    #
    # Real wear over a one-second tick is imperceptible, so the live engine ages
    # components faster than wall time: at 60, one second of watching advances
    # service life by one minute, and an hour at the screen ages the estate by
    # about two and a half days. The historical back-fill deliberately does NOT
    # use this scale — the stored past is the true past, at one day per day.
    wear_time_scale: float = 60.0

    # Raw per-second telemetry older than this is pruned by the retention task.
    # Historical analysis is served from the down-sampled rows written by the
    # backfill, which are never pruned.
    raw_retention_hours: int = 24
    retention_interval_seconds: int = 900

    # How often derived state is written back to PostgreSQL.
    analytics_interval_seconds: int = 30

    # ── History backfill ─────────────────────────────────────────────────
    history_days: int = 30
    # Sampling plan: hourly beyond 7 days, quarter-hourly inside 7 days,
    # per-minute inside 24 hours. A month of per-second history would be
    # 62 million rows per device and is neither storable nor useful.
    backfill_hour_step_seconds: int = 3600
    backfill_quarter_step_seconds: int = 900
    backfill_minute_step_seconds: int = 60

    seed_on_startup: bool = True
    backfill_on_startup: bool = True

    # ── Machine learning ─────────────────────────────────────────────────
    ml_enabled: bool = True
    ml_min_training_samples: int = 120
    ml_refit_interval_seconds: int = 300
    ml_contamination: float = 0.03

    # ── CORS ─────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    log_level: str = "INFO"

    @field_validator("tick_interval_seconds")
    @classmethod
    def _positive_tick(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("tick_interval_seconds must be greater than zero")
        return value

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def maintenance_url(self) -> str:
        """Connection to the `postgres` database, used only to CREATE DATABASE."""
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/postgres"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
