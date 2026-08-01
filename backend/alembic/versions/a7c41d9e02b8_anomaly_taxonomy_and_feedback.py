"""Anomaly taxonomy store and technician feedback log.

Adds two tables:

  · `anomaly_events`        — events resolved to an M01–M15 failure mode, with the
                              1 Hz sample they were raised from and the
                              ground-truth mechanism where one was injected
  · `anomaly_feedback_logs` — technician judgement, which is what makes precision
                              measurable rather than assumed

`anomaly_detection` is left untouched. It records the measurement fact against
the channel rule that produced it and the reporting endpoints read it; both
tables are written from the same detector journal in the same transaction, so
they are two projections of one source rather than two sources.

Revision ID: a7c41d9e02b8
Revises: 32b436e381e2
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7c41d9e02b8"
down_revision: str | None = "32b436e381e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `gen_random_uuid()` is core from PostgreSQL 13. On 12 and earlier it comes
    # from pgcrypto, so the extension is requested rather than assumed — and the
    # ORM also generates the key client-side, so a database that permits neither
    # still works.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "anomaly_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_uid", sa.String(length=64), nullable=False),
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("type_id", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="ACTIVE", nullable=False),
        sa.Column("breach_magnitude", sa.Float(), nullable=False),
        sa.Column(
            "telemetry_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("mechanism", sa.String(length=128), nullable=True),
        sa.Column("ingest_latency_ms", sa.Float(), nullable=True),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_anomaly_events_source_uid"), "anomaly_events", ["source_uid"], unique=True
    )
    # Column order follows the access pattern: the status-bar and breakdown
    # queries filter on status first and then group by category.
    op.create_index(
        "idx_anomaly_status_cat",
        "anomaly_events",
        ["status", "category", sa.text("detected_at DESC")],
        unique=False,
    )
    op.create_index(
        "idx_anomaly_device",
        "anomaly_events",
        ["device_id", sa.text("detected_at DESC")],
        unique=False,
    )
    op.create_index("idx_anomaly_type_id", "anomaly_events", ["type_id"], unique=False)

    op.create_table(
        "anomaly_feedback_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feedback_type", sa.String(length=32), nullable=False),
        sa.Column("technician_id", sa.String(length=64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "logged_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["event_id"], ["anomaly_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_anomaly_feedback_logs_event_id"), "anomaly_feedback_logs", ["event_id"]
    )
    op.create_index(
        op.f("ix_anomaly_feedback_logs_technician_id"), "anomaly_feedback_logs", ["technician_id"]
    )
    op.create_index(
        "idx_feedback_event_type", "anomaly_feedback_logs", ["event_id", "feedback_type"]
    )


def downgrade() -> None:
    op.drop_index("idx_feedback_event_type", table_name="anomaly_feedback_logs")
    op.drop_index(
        op.f("ix_anomaly_feedback_logs_technician_id"), table_name="anomaly_feedback_logs"
    )
    op.drop_index(op.f("ix_anomaly_feedback_logs_event_id"), table_name="anomaly_feedback_logs")
    op.drop_table("anomaly_feedback_logs")

    op.drop_index("idx_anomaly_type_id", table_name="anomaly_events")
    op.drop_index("idx_anomaly_device", table_name="anomaly_events")
    op.drop_index("idx_anomaly_status_cat", table_name="anomaly_events")
    op.drop_index(op.f("ix_anomaly_events_source_uid"), table_name="anomaly_events")
    op.drop_table("anomaly_events")

    # The extension is left in place: it may predate this migration or be in use
    # elsewhere, and dropping a shared extension on a downgrade is not this
    # revision's call to make.
