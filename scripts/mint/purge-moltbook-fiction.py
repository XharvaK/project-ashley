#!/usr/bin/env python3
"""Surgical purge of fabricated Moltbook facts/stances + JSON backup.

Run on Mint:
  python3 scripts/mint/purge-moltbook-fiction.py
  # or after scp:
  python3 /tmp/purge-moltbook-fiction.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB = os.path.expanduser("~/.composer-assistant/conversations/index.db")
BACKUP_DIR = os.path.expanduser("~/.composer-assistant/backups")


def main() -> int:
    if not os.path.exists(DB):
        print("db missing:", DB, file=sys.stderr)
        return 1

    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = os.path.join(BACKUP_DIR, f"molt-fiction-{stamp}.json")

    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row

    facts = list(
        c.execute(
            """
            SELECT * FROM mem_facts
            WHERE superseded_by IS NULL
              AND (
                lower(key) LIKE '%molt%'
                OR lower(value) LIKE '%molt%'
                OR lower(key) LIKE '%moltbook%'
                OR lower(value) LIKE '%moltbook%'
              )
            """
        )
    )
    stances = list(
        c.execute(
            """
            SELECT * FROM mem_stances
            WHERE superseded_by IS NULL
              AND (
                lower(topic) LIKE '%molt%'
                OR lower(stance) LIKE '%molt%'
                OR lower(topic) LIKE '%registration%'
                OR lower(topic) LIKE '%agent naming%'
                OR lower(topic) LIKE '%social media%'
              )
            """
        )
    )

    payload = {
        "exportedAt": stamp,
        "facts": [dict(r) for r in facts],
        "stances": [dict(r) for r in stances],
    }
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)
    print("backup:", backup_path, "facts=", len(facts), "stances=", len(stances))

    for r in facts:
        c.execute("UPDATE mem_facts SET superseded_by = id WHERE id = ?", (r["id"],))
    for r in stances:
        c.execute("UPDATE mem_stances SET superseded_by = id WHERE id = ?", (r["id"],))

    c.execute(
        """
        INSERT INTO mem_kv(key, value, updated_at) VALUES(?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        """,
        (
            "moltbook:correction_note",
            "Prior join/claim/server claims in chat were false. Not registered unless moltbook:credentials + active status exist.",
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    c.commit()
    print("purged facts/stances; correction note set")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
