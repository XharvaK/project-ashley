from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from .gates import (
    clear_incident_lock,
    doc_engagement_path,
    ensure_incident_lock_seeded,
    incident_is_locked,
    incident_lock_path,
    loop_state_path,
    pending_draft_path,
)
from .lint import lint_outbound

PHASES = ("waiting_on_orchid", "need_doc_reply", "draft", "send")

_DRAFT_SEND = re.compile(r"^SEND:\s*(.*)$", re.S)
_DRAFT_NO = re.compile(r"^NO_SEND:\s*(.*)$", re.S)


def _now_local() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def load_loop_state() -> dict[str, Any]:
    path = loop_state_path()
    if not path.is_file():
        return {"phase": "waiting_on_orchid"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"phase": "waiting_on_orchid"}
    if data.get("phase") not in PHASES:
        data["phase"] = "waiting_on_orchid"
    return data


def save_loop_state(state: dict[str, Any]) -> None:
    loop_state_path().write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def append_doc_engagement(
    action: str,
    what: str,
    *,
    doc_note: str = "-",
) -> None:
    path = doc_engagement_path()
    if not path.is_file():
        path.write_text(
            "# Doc engagement log (never paste into Orchid)\n\n",
            encoding="utf-8",
        )
    line = f"{_now_local()} | {action} | {what[:120]} | Doc note: {doc_note}\n"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(line)


def parse_pending_draft(raw: str) -> tuple[str, str]:
    """Return (kind, payload) where kind is SEND | NO_SEND | INVALID."""
    text = raw.strip()
    if not text:
        return "INVALID", "empty draft"
    m = _DRAFT_SEND.match(text)
    if m:
        bubble = m.group(1).strip()
        if not bubble:
            return "INVALID", "empty SEND"
        if "\n\n" in bubble or bubble.count("\n") > 2:
            return "INVALID", "multi_bubble"
        return "SEND", bubble
    m = _DRAFT_NO.match(text)
    if m:
        return "NO_SEND", m.group(1).strip() or "no reason"
    return "INVALID", "draft must start with SEND: or NO_SEND:"


def write_pending_draft(content: str) -> Path:
    path = pending_draft_path()
    path.write_text(content.strip() + "\n", encoding="utf-8")
    return path


def read_pending_draft() -> str:
    path = pending_draft_path()
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def clear_pending_draft() -> None:
    pending_draft_path().unlink(missing_ok=True)


def cmd_incident_status() -> dict[str, Any]:
    ensure_incident_lock_seeded()
    locked = incident_is_locked()
    return {
        "ok": True,
        "locked": locked,
        "path": str(incident_lock_path()),
        "hint": (
            "Doc must type CLEAR in Cursor, then: orchid-tg incident clear"
            if locked
            else "unlocked"
        ),
    }


def cmd_incident_clear(*, by: str = "doc") -> dict[str, Any]:
    result = clear_incident_lock(by=by)
    append_doc_engagement("READ", "incident CLEAR", doc_note=f"cleared_by={by}")
    return result


def turn_status() -> dict[str, Any]:
    ensure_incident_lock_seeded()
    state = load_loop_state()
    draft = read_pending_draft().strip()
    return {
        "ok": True,
        "phase": state.get("phase"),
        "incident_locked": incident_is_locked(),
        "pending_draft": draft[:200] if draft else None,
        "pending_draft_path": str(pending_draft_path()),
        "loop_state_path": str(loop_state_path()),
        "doc_engagement": str(doc_engagement_path()),
    }


async def cmd_turn(
    *,
    wait_for_reply: bool = False,
    wait_tier_name: str = "reply",
) -> dict[str, Any]:
    """Cover-safe turn loop. Never invents message lists.

    Operator/Cursor fills pending-draft.txt, then re-runs turn to send.
    """
    from . import client as tg

    ensure_incident_lock_seeded()
    state = load_loop_state()
    phase = state.get("phase") or "waiting_on_orchid"

    hist = await tg.cmd_history(limit=40)
    messages = hist.get("messages") or []

    if phase == "waiting_on_orchid" and wait_for_reply:
        wait_payload = await tg.cmd_wait(wait_tier_name=wait_tier_name)
        got = bool(wait_payload.get("reply"))
        state["phase"] = "need_doc_reply" if got else "draft"
        save_loop_state(state)
        append_doc_engagement(
            "READ",
            "wait done got_reply=" + str(got),
        )
        return {
            "ok": True,
            "phase": state["phase"],
            "wait": wait_payload,
            "next": "write pending-draft.txt then orchid-tg turn",
        }

    if phase in ("waiting_on_orchid", "need_doc_reply", "draft", "send"):
        raw = read_pending_draft()
        if not raw.strip():
            state["phase"] = "draft"
            save_loop_state(state)
            return {
                "ok": True,
                "phase": "draft",
                "action": "DRAFT_NEEDED",
                "path": str(pending_draft_path()),
                "incident_locked": incident_is_locked(),
                "hint": (
                    "Write SEND: <one bubble> or NO_SEND: <reason> to "
                    f"{pending_draft_path()}"
                ),
            }

        kind, payload = parse_pending_draft(raw)
        if kind == "INVALID":
            return {
                "ok": False,
                "errors": [payload],
                "phase": "draft",
            }

        if kind == "NO_SEND":
            clear_pending_draft()
            state["phase"] = "waiting_on_orchid"
            save_loop_state(state)
            append_doc_engagement("NO_SEND", payload)
            return {
                "ok": True,
                "phase": "waiting_on_orchid",
                "action": "NO_SEND",
                "reason": payload,
            }

        lint = lint_outbound(payload)
        if not lint.ok:
            return {
                "ok": False,
                "errors": lint.errors,
                "warnings": lint.warnings,
                "text": lint.text,
                "phase": "draft",
            }

        if incident_is_locked():
            state["phase"] = "draft"
            save_loop_state(state)
            return {
                "ok": False,
                "errors": ["incident_locked_awaiting_doc_clear"],
                "phase": "draft",
                "text": lint.text,
                "hint": "Doc types CLEAR, then: orchid-tg incident clear",
            }

        state["phase"] = "send"
        save_loop_state(state)
        send_result = await tg.cmd_send(
            lint.text,
            no_wait=not wait_for_reply,
            wait_tier_name=wait_tier_name if wait_for_reply else None,
            history_msgs=messages,
        )
        if not send_result.get("ok"):
            state["phase"] = "draft"
            save_loop_state(state)
            return {
                "ok": False,
                "phase": "draft",
                "send": send_result,
            }

        clear_pending_draft()
        state["phase"] = "waiting_on_orchid"
        save_loop_state(state)
        append_doc_engagement("SEND", lint.text[:80])
        return {
            "ok": True,
            "phase": "waiting_on_orchid",
            "action": "SEND",
            "send": send_result,
        }

    return {"ok": False, "errors": [f"unknown_phase:{phase}"]}
