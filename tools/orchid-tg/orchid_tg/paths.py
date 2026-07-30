from __future__ import annotations

import os
from pathlib import Path


def home_data() -> Path:
    override = os.environ.get("COMPOSER_ASSISTANT_HOME")
    if override:
        return Path(override)
    return Path.home() / ".composer-assistant"


def env_file() -> Path:
    return Path(os.environ.get("COMPOSER_ENV_FILE", home_data() / ".env"))


def telegram_dir() -> Path:
    d = home_data() / "telegram"
    d.mkdir(parents=True, exist_ok=True)
    return d


def session_path() -> Path:
    return telegram_dir() / "doc.session"


def peers_path() -> Path:
    return telegram_dir() / "peers.json"


def send_lock_path() -> Path:
    return telegram_dir() / "send.lock"


def logs_dir() -> Path:
    d = home_data() / "orchid-logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def style_card_path() -> Path:
    return logs_dir() / "style-card.md"


def voice_lock_path() -> Path:
    return logs_dir() / "voice-lock.jsonl"


def matrix_path() -> Path:
    return logs_dir() / "matrix.md"


def summary_path() -> Path:
    return logs_dir() / "SUMMARY.md"


def goals_path() -> Path:
    return logs_dir() / "goals-remaining.json"


def login_pending_path() -> Path:
    return telegram_dir() / "login-pending.json"


ORCHID_USERNAME = "OrchidHQBot"
