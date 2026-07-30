from __future__ import annotations

import os
from pathlib import Path

from .paths import env_file


def load_dotenv(path: Path | None = None) -> None:
    p = path or env_file()
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        eq = trimmed.find("=")
        if eq <= 0:
            continue
        key = trimmed[:eq].strip()
        value = trimmed[eq + 1 :].strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        if key not in os.environ:
            os.environ[key] = value


def require_api_creds() -> tuple[int, str]:
    load_dotenv()
    raw_id = os.environ.get("TELEGRAM_API_ID", "").strip()
    api_hash = os.environ.get("TELEGRAM_API_HASH", "").strip()
    if not raw_id or not api_hash:
        raise SystemExit(
            "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in "
            f"{env_file()}"
        )
    try:
        api_id = int(raw_id)
    except ValueError as exc:
        raise SystemExit("TELEGRAM_API_ID must be an integer") from exc
    return api_id, api_hash
