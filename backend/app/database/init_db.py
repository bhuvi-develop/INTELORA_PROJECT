"""Database bootstrap.

Creates `intelora_db` if it is absent, creates every table, and seeds the asset
register from the catalog. Safe to run repeatedly: seeding is by natural key, so
a second run updates the engineering attributes and leaves accumulated wear and
history alone.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database.base import Base, engine as app_engine
from app.logging_config import get_logger
from app.mock_data.catalog import ASSET_SEEDS, device_uid_for, mqtt_topic_for, profile_for
from app.models.asset import Asset, AssetComponent, Device
from app.models.user import User

logger = get_logger(__name__)


def ensure_database() -> bool:
    """Create the database if the server does not already have it."""
    maintenance = create_engine(settings.maintenance_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with maintenance.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": settings.postgres_db},
            ).scalar()

            if exists:
                logger.info("database %s already present", settings.postgres_db)
                return False

            # The database name comes from configuration, never from a request,
            # and CREATE DATABASE cannot take a bound parameter.
            connection.execute(text(f'CREATE DATABASE "{settings.postgres_db}"'))
            logger.info("created database %s", settings.postgres_db)
            return True
    finally:
        maintenance.dispose()


def create_tables() -> None:
    Base.metadata.create_all(bind=app_engine)
    logger.info("schema ensured (%d tables)", len(Base.metadata.tables))


def _hash_password(raw: str) -> str:
    """Deterministic hash for the seeded account.

    Authentication is not yet wired into the API, so this exists to keep the
    column honest rather than to protect anything. Replace with a real KDF when
    the login flow is enabled.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def seed_users(session: Session) -> int:
    if session.execute(select(User.id).limit(1)).first() is not None:
        return 0

    session.add_all(
        [
            User(
                username="administrator",
                email="admin@intelora.local",
                full_name="Platform Administrator",
                hashed_password=_hash_password("intelora"),
                role="administrator",
            ),
            User(
                username="operator",
                email="operator@intelora.local",
                full_name="Estate Operator",
                hashed_password=_hash_password("intelora"),
                role="operator",
            ),
        ]
    )
    logger.info("seeded 2 users")
    return 2


def seed_assets(session: Session) -> tuple[int, int]:
    """Insert or refresh the asset register, its components and its sensors."""
    created = 0
    updated = 0
    commissioned = datetime.now(timezone.utc) - timedelta(days=settings.history_days)

    for seed in ASSET_SEEDS:
        profile = profile_for(seed)

        asset = session.execute(
            select(Asset).where(Asset.asset_id == seed.asset_id)
        ).scalar_one_or_none()

        if asset is None:
            asset = Asset(
                asset_id=seed.asset_id,
                asset_name=seed.asset_name,
                category=seed.category,
                brand=seed.brand,
                model=seed.model,
                status="Online",
                criticality=seed.criticality,
                rated_power_w=profile.rated_power_w,
                nominal_voltage_v=profile.nominal_voltage,
                max_temperature_c=profile.max_temperature_c,
                max_current_a=profile.max_current_a,
                commissioned_at=commissioned,
            )
            session.add(asset)
            created += 1
        else:
            asset.asset_name = seed.asset_name
            asset.category = seed.category
            asset.brand = seed.brand
            asset.model = seed.model
            asset.criticality = seed.criticality
            asset.rated_power_w = profile.rated_power_w
            asset.nominal_voltage_v = profile.nominal_voltage
            asset.max_temperature_c = profile.max_temperature_c
            asset.max_current_a = profile.max_current_a
            updated += 1

        existing_components = {
            row.name: row
            for row in session.execute(
                select(AssetComponent).where(AssetComponent.asset_id == seed.asset_id)
            ).scalars()
        }

        for position, spec in enumerate(profile.components):
            component = existing_components.get(spec.name)
            if component is None:
                session.add(
                    AssetComponent(
                        asset_id=seed.asset_id,
                        name=spec.name,
                        position=position,
                        wear=seed.initial_wear[position] if position < len(seed.initial_wear) else 0.05,
                        base_wear_per_day=spec.base_wear_per_day * seed.duty_factor,
                        expected_life_days=spec.expected_life_days,
                    )
                )
            else:
                # Wear is never rewritten by a re-seed; the estate's accumulated
                # age is real state, not configuration.
                component.position = position
                component.base_wear_per_day = spec.base_wear_per_day * seed.duty_factor
                component.expected_life_days = spec.expected_life_days

        device_uid = device_uid_for(seed.asset_id)
        device = session.execute(
            select(Device).where(Device.device_uid == device_uid)
        ).scalar_one_or_none()

        if device is None:
            session.add(
                Device(
                    device_uid=device_uid,
                    asset_id=seed.asset_id,
                    sensor_model="MIKOS-SES-01",
                    firmware_version="2.4.1",
                    gateway_id="GW-EDGE-01" if seed.category == "Laptop" else "GW-EDGE-02",
                    mqtt_topic=mqtt_topic_for(seed.asset_id),
                    relay_status="Closed",
                    installed_at=commissioned,
                )
            )

    logger.info("asset register seeded (%d created, %d refreshed)", created, updated)
    return created, updated


def initialise(session: Session) -> None:
    """Full bootstrap for a fresh or existing installation."""
    seed_assets(session)
    seed_users(session)
