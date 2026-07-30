from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from .lint import normalize_text
from .paths import logs_dir
from .voice_lock import load_voice_lock

DUP_N = 30
DUP_RATIO = 0.86
MIN_GAP_S = 8.0

OPEN_Q = re.compile(
    r"(?i)("
    r"\?|¿|"
    r"\b(why|what|how|when|where|who|which|whose)\b|"
    r"\b(mi|mı|mu|mü|ne|nasıl|hangi|neden|niye)\b"
    r")"
)
ANSWER_START = re.compile(
    r"(?i)^(yes|no|nah|yep|yeah|sure|idk|lol|yok|evet|hayır|ok|okay|k)\b"
)


@dataclass
class GateResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


def send_turn_path() -> Path:
    return logs_dir() / "send-turn.json"


def incident_lock_path() -> Path:
    return logs_dir() / "incident-lock.json"


def loop_state_path() -> Path:
    return logs_dir() / "loop-state.json"


def pending_draft_path() -> Path:
    return logs_dir() / "pending-draft.txt"


def doc_engagement_path() -> Path:
    return logs_dir() / "doc-engagement.md"


def norm_for_dupe(text: str) -> str:
    t = normalize_text(text).lower()
    t = re.sub(r"[^\w\s]", " ", t, flags=re.UNICODE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def load_today_outbounds(limit: int = DUP_N) -> list[str]:
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = logs_dir() / f"{day}.jsonl"
    if not path.is_file():
        return []
    out: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("direction") != "out":
            continue
        text = (row.get("text") or "").strip()
        if text:
            out.append(text)
    return out[-limit:]


def load_recent_outbounds(n: int = DUP_N) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for text in load_voice_lock(n) + load_today_outbounds(n):
        key = norm_for_dupe(text)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(text)
    return merged[-n:]


def is_near_dupe(text: str, corpus: list[str]) -> bool:
    needle = norm_for_dupe(text)
    if not needle:
        return False
    for prior in corpus:
        other = norm_for_dupe(prior)
        if not other:
            continue
        if needle == other:
            return True
        if SequenceMatcher(None, needle, other).ratio() >= DUP_RATIO:
            return True
    return False


def last_inbound_is_open_q(history_msgs: list[dict[str, Any]]) -> tuple[bool, str]:
    """history_msgs oldest→newest with keys out/text (history) or direction/text (jsonl)."""
    for msg in reversed(history_msgs):
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        if "out" in msg:
            outbound = bool(msg.get("out"))
        else:
            outbound = msg.get("direction") == "out"
        if outbound:
            continue
        return bool(OPEN_Q.search(text)), text
    return False, ""


def looks_like_short_answer(text: str, question: str) -> bool:
    t = text.strip()
    if not t or len(t) > 140:
        return False
    if t.rstrip().endswith("?"):
        return False
    if ANSWER_START.search(t):
        return True
    # Drop ultra-common tokens so "you"/"that" cannot false-pass
    stop = {
        "the",
        "and",
        "for",
        "you",
        "your",
        "are",
        "was",
        "were",
        "this",
        "that",
        "with",
        "have",
        "what",
        "when",
        "where",
        "which",
        "who",
        "how",
        "why",
        "would",
        "rather",
        "every",
        "from",
        "just",
        "got",
        "one",
    }
    q_tokens = {
        w
        for w in re.findall(r"[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]{3,}", question.lower())
        if w not in stop
    }
    t_tokens = {
        w
        for w in re.findall(r"[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]{3,}", t.lower())
        if w not in stop
    }
    return bool(q_tokens & t_tokens)


def check_turn_once() -> str | None:
    path = send_turn_path()
    turn_id = os.environ.get("ORCHID_TG_TURN_ID") or f"{os.getppid()}:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
        if data.get("turn_id") == turn_id and data.get("sent"):
            return "max_one_outbound_per_turn"
    return None


def mark_turn_sent(msg_id: int | None = None) -> None:
    turn_id = os.environ.get("ORCHID_TG_TURN_ID") or f"{os.getppid()}:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"
    send_turn_path().write_text(
        json.dumps(
            {
                "turn_id": turn_id,
                "sent": True,
                "ts": datetime.now(timezone.utc).isoformat(),
                "msg_id": msg_id,
                "pid": os.getpid(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def last_outbound_ts(corpus_meta: list[dict[str, Any]] | None = None) -> float | None:
    """Best-effort last outbound unix time from today's jsonl."""
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = logs_dir() / f"{day}.jsonl"
    if not path.is_file():
        return None
    last: float | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("direction") != "out":
            continue
        ts = row.get("ts")
        if not ts:
            continue
        try:
            last = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
    if corpus_meta:
        pass
    return last


def ensure_incident_lock_seeded() -> None:
    """Cover incident open until Doc CLEAR. Create locked file if missing."""
    path = incident_lock_path()
    if path.is_file():
        return
    path.write_text(
        json.dumps(
            {
                "locked": True,
                "reason": "cover_incident_test_dump",
                "ts": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def incident_is_locked() -> bool:
    ensure_incident_lock_seeded()
    path = incident_lock_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return True
    return bool(data.get("locked", True))


def clear_incident_lock(*, by: str = "doc") -> dict[str, Any]:
    path = incident_lock_path()
    payload = {
        "locked": False,
        "cleared_by": by,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"ok": True, **payload}


def check_all(
    text: str,
    history_msgs: list[dict[str, Any]] | None = None,
    *,
    force_unrelated: str | None = None,
    skip_incident: bool = False,
) -> GateResult:
    errors: list[str] = []
    meta: dict[str, Any] = {}

    if not skip_incident and incident_is_locked():
        errors.append("incident_locked_awaiting_doc_clear")

    turn_err = check_turn_once()
    if turn_err:
        errors.append(turn_err)

    last_ts = last_outbound_ts()
    if last_ts is not None and (time.time() - last_ts) < MIN_GAP_S:
        errors.append("min_gap")
        meta["min_gap_s"] = MIN_GAP_S
        meta["since_last_s"] = round(time.time() - last_ts, 2)

    corpus = load_recent_outbounds(DUP_N)
    meta["corpus_n"] = len(corpus)
    if is_near_dupe(text, corpus):
        errors.append("near_duplicate")

    hist = history_msgs or []
    open_q, q_text = last_inbound_is_open_q(hist)
    meta["open_question"] = open_q
    if open_q:
        meta["question"] = q_text[:200]
        force = (force_unrelated or "").strip()
        if force and len(force) >= 8:
            meta["force_unrelated"] = force
        elif not looks_like_short_answer(text, q_text):
            errors.append("must_answer_open_question")

    return GateResult(ok=len(errors) == 0, errors=errors, meta=meta)
