"""Logging setup.

One rotating file per run plus console output. The simulator writes a line per
lifecycle event rather than per tick — a line every second across 24 devices
would bury anything worth reading.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from app.config import LOG_DIR, settings

_CONFIGURED = False

FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-28s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(FORMAT, datefmt=DATE_FORMAT)

    console = logging.StreamHandler()
    console.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        LOG_DIR / "intelora_backend.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    root.handlers.clear()
    root.addHandler(console)
    root.addHandler(file_handler)

    # SQLAlchemy's own INFO stream is one line per statement; at one insert per
    # second that is noise, so it stays at WARNING unless echo is switched on.
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.db_echo else logging.WARNING
    )

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
