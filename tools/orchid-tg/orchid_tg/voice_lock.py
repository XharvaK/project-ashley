from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .paths import style_card_path, voice_lock_path

DEFAULT_STYLE_CARD = """# Doc style card (bootstrap, HOW only, never paste into Orchid)

- Short Telegram bubbles, usually 1-2 lines
- Casual: lowercase OK, typos OK, "lol" "rn" "nah" "idk" OK
- TR/EN mix when natural; one language per bubble preferred
- Direct and curious, not corporate, not feature-tour
- No em dashes, no markdown, no assistant-speak
- Friend vibe; unemployed / not using work tools if asked to link accounts
- Prefer need over inventory ("can you remind me..." not "what can you do")
"""


def ensure_style_card() -> Path:
    path = style_card_path()
    if not path.is_file():
        path.write_text(DEFAULT_STYLE_CARD, encoding="utf-8")
    return path


def append_voice_lock(text: str, msg_id: int | None = None) -> None:
    path = voice_lock_path()
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "msg_id": msg_id,
        "text": text,
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_voice_lock(limit: int = 40) -> list[str]:
    path = voice_lock_path()
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        text = (row.get("text") or "").strip()
        if text:
            out.append(text)
    return out


def voice_lock_count() -> int:
    return len(load_voice_lock(limit=10_000))
