from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from telethon import TelegramClient, events
from telethon.errors import FloodWaitError
from telethon.tl.functions.messages import SetTypingRequest
from telethon.tl.types import SendMessageTypingAction

from .env_load import require_api_creds
from .gates import check_all, mark_turn_sent
from .lint import lint_outbound
from .paths import (
    ORCHID_USERNAME,
    logs_dir,
    peers_path,
    send_lock_path,
    session_path,
)
from .voice_lock import append_voice_lock, ensure_style_card
from .waits import wait_reading, wait_tier


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_event(event: dict[str, Any]) -> None:
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = logs_dir() / f"{day}.jsonl"
    safe = dict(event)
    # never log secrets
    for key in ("api_hash", "session", "phone", "password"):
        safe.pop(key, None)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(safe, ensure_ascii=False) + "\n")


def _acquire_send_lock(timeout: float = 120.0) -> None:
    lock = send_lock_path()
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return
        except FileExistsError:
            time.sleep(0.25)
    raise RuntimeError("send.lock busy")


def _release_send_lock() -> None:
    try:
        send_lock_path().unlink(missing_ok=True)
    except OSError:
        pass


def build_client() -> TelegramClient:
    api_id, api_hash = require_api_creds()
    return TelegramClient(str(session_path()), api_id, api_hash)


async def resolve_orchid(client: TelegramClient) -> Any:
    entity = await client.get_entity(ORCHID_USERNAME)
    peers = {"orchid_username": ORCHID_USERNAME, "orchid_id": entity.id}
    peers_path().write_text(json.dumps(peers, indent=2), encoding="utf-8")
    return entity


@asynccontextmanager
async def connected_client() -> AsyncIterator[TelegramClient]:
    client = build_client()
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        raise SystemExit("Not logged in. Run: orchid-tg login")
    try:
        yield client
    finally:
        await client.disconnect()


async def cmd_login(
    *,
    phone: str | None = None,
    code: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """Phone + code login (QR expired too fast). Two steps:

    1) orchid-tg login --phone +90...
    2) orchid-tg login --code 12345
       (optional --password if 2FA)
    """
    from .paths import login_pending_path

    ensure_style_card()
    client = build_client()
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        await resolve_orchid(client)
        await client.disconnect()
        login_pending_path().unlink(missing_ok=True)
        return {
            "ok": True,
            "already": True,
            "user_id": me.id,
            "username": me.username,
            "first_name": me.first_name,
        }

    # Step 2: complete with code
    if code:
        pending_path = login_pending_path()
        if not pending_path.is_file():
            await client.disconnect()
            raise SystemExit(
                "No pending login. First run: orchid-tg login --phone +90..."
            )
        pending = json.loads(pending_path.read_text(encoding="utf-8"))
        phone_saved = pending.get("phone")
        phone_code_hash = pending.get("phone_code_hash")
        if not phone_saved or not phone_code_hash:
            await client.disconnect()
            raise SystemExit("Corrupt login-pending.json; re-run with --phone")

        try:
            await client.sign_in(
                phone=phone_saved,
                code=code.strip(),
                phone_code_hash=phone_code_hash,
            )
        except Exception as exc:
            # 2FA cloud password
            from telethon.errors import SessionPasswordNeededError

            if isinstance(exc, SessionPasswordNeededError):
                if not password:
                    await client.disconnect()
                    raise SystemExit(
                        "2FA enabled. Re-run: orchid-tg login --code "
                        f"{code.strip()} --password YOUR_CLOUD_PASSWORD"
                    ) from exc
                await client.sign_in(password=password)
            else:
                await client.disconnect()
                raise

        pending_path.unlink(missing_ok=True)
        me = await client.get_me()
        await resolve_orchid(client)
        await client.disconnect()
        return {
            "ok": True,
            "already": False,
            "user_id": me.id,
            "username": me.username,
            "first_name": me.first_name,
        }

    # Step 1: request code
    if not phone:
        await client.disconnect()
        raise SystemExit(
            "Use phone login (QR expires too fast):\n"
            "  orchid-tg login --phone +90XXXXXXXXXX\n"
            "Then Telegram sends a code; finish with:\n"
            "  orchid-tg login --code 12345"
        )

    phone_norm = phone.strip().replace(" ", "")
    if not phone_norm.startswith("+"):
        await client.disconnect()
        raise SystemExit("Phone must include country code, e.g. +90...")

    sent = await client.send_code_request(phone_norm)
    login_pending_path().write_text(
        json.dumps(
            {
                "phone": phone_norm,
                "phone_code_hash": sent.phone_code_hash,
                "ts": _now_iso(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    await client.disconnect()
    return {
        "ok": True,
        "pending": True,
        "phone": phone_norm,
        "next": "orchid-tg login --code YOUR_CODE",
        "hint": "Check Telegram app / SMS for the login code. If 2FA, add --password.",
    }


async def cmd_status() -> dict[str, Any]:
    async with connected_client() as client:
        me = await client.get_me()
        orchid = await resolve_orchid(client)
        return {
            "ok": True,
            "authorized": True,
            "user_id": me.id,
            "username": me.username,
            "first_name": me.first_name,
            "orchid_id": orchid.id,
            "session": str(session_path()),
        }


async def cmd_send(
    text: str,
    *,
    wait_tier_name: str | None = None,
    wait_band: tuple[float, float] | None = None,
    file: Path | None = None,
    no_wait: bool = False,
    force_unrelated: str | None = None,
    skip_incident: bool = False,
    history_msgs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    lint = lint_outbound(text)
    if not lint.ok:
        return {
            "ok": False,
            "errors": lint.errors,
            "warnings": lint.warnings,
            "text": lint.text,
        }

    hist = history_msgs
    if hist is None:
        try:
            hist_payload = await cmd_history(limit=40)
            hist = hist_payload.get("messages") or []
        except Exception:
            hist = []

    gates = check_all(
        lint.text,
        hist,
        force_unrelated=force_unrelated,
        skip_incident=skip_incident,
    )
    if not gates.ok:
        return {
            "ok": False,
            "errors": gates.errors,
            "warnings": lint.warnings,
            "text": lint.text,
            "gate_meta": gates.meta,
        }

    _acquire_send_lock()
    try:
        async with connected_client() as client:
            orchid = await resolve_orchid(client)
            pre = wait_tier("short")
            # typing indicator proportional to length
            typing_s = min(8.0, max(0.8, 0.03 * len(lint.text)))
            try:
                await client(
                    SetTypingRequest(orchid, SendMessageTypingAction())
                )
            except Exception:
                pass
            await asyncio.sleep(typing_s)

            try:
                if file:
                    sent = await client.send_file(
                        orchid, str(file), caption=lint.text or None
                    )
                else:
                    sent = await client.send_message(orchid, lint.text)
            except FloodWaitError as exc:
                await asyncio.sleep(exc.seconds + wait_tier("short"))
                if file:
                    sent = await client.send_file(
                        orchid, str(file), caption=lint.text or None
                    )
                else:
                    sent = await client.send_message(orchid, lint.text)

            msg_id = getattr(sent, "id", None)
            append_voice_lock(lint.text, msg_id)
            mark_turn_sent(msg_id)
            event = {
                "ts": _now_iso(),
                "direction": "out",
                "msg_id": msg_id,
                "text": lint.text,
                "pre_send_s": pre,
                "typing_s": typing_s,
                "warnings": lint.warnings,
            }
            _log_event(event)

            reply_payload = None
            if not no_wait:
                reply_payload = await _wait_reply(
                    client,
                    orchid,
                    after_id=msg_id or 0,
                    wait_tier_name=wait_tier_name or "reply",
                    wait_band=wait_band,
                )

            return {
                "ok": True,
                "msg_id": msg_id,
                "text": lint.text,
                "warnings": lint.warnings,
                "gate_meta": gates.meta,
                "reply": reply_payload,
            }
    finally:
        _release_send_lock()


async def _wait_reply(
    client: TelegramClient,
    orchid: Any,
    *,
    after_id: int,
    wait_tier_name: str,
    wait_band: tuple[float, float] | None,
) -> dict[str, Any] | None:
    from .waits import draw_band, draw_tier

    deadline_budget = (
        draw_band(*wait_band)
        if wait_band
        else draw_tier(wait_tier_name)
    )
    # wall clock = 2x draw for give-up
    deadline = time.time() + deadline_budget * 2
    poll = 1.5
    extended = False

    while time.time() < deadline:
        messages = await client.get_messages(orchid, limit=8)
        for msg in messages:
            if msg.out:
                continue
            if (msg.id or 0) <= after_id:
                continue
            text = msg.message or ""
            wait_reading(text)
            payload = {
                "msg_id": msg.id,
                "text": text,
                "ts": msg.date.isoformat() if msg.date else _now_iso(),
            }
            _log_event(
                {
                    "ts": _now_iso(),
                    "direction": "in",
                    "msg_id": msg.id,
                    "text": text,
                }
            )
            return payload
        await asyncio.sleep(poll)
        if (
            not extended
            and time.time() > deadline - deadline_budget
            and wait_tier_name == "reply"
            and wait_band is None
        ):
            # one think extension
            extended = True
            deadline = time.time() + draw_tier("think")

    return None


async def cmd_wait(
    *,
    wait_tier_name: str = "reply",
    wait_band: tuple[float, float] | None = None,
    after_id: int | None = None,
) -> dict[str, Any]:
    async with connected_client() as client:
        orchid = await resolve_orchid(client)
        if after_id is None:
            recent = await client.get_messages(orchid, limit=1)
            after_id = recent[0].id if recent else 0
        reply = await _wait_reply(
            client,
            orchid,
            after_id=after_id,
            wait_tier_name=wait_tier_name,
            wait_band=wait_band,
        )
        return {"ok": True, "reply": reply}


async def cmd_history(limit: int = 40) -> dict[str, Any]:
    async with connected_client() as client:
        orchid = await resolve_orchid(client)
        me = await client.get_me()
        messages = await client.get_messages(orchid, limit=limit)
        rows = []
        for msg in reversed(list(messages)):
            rows.append(
                {
                    "msg_id": msg.id,
                    "out": bool(msg.out),
                    "from_id": me.id if msg.out else orchid.id,
                    "text": msg.message or "",
                    "ts": msg.date.isoformat() if msg.date else None,
                    "has_media": bool(msg.media),
                }
            )
        return {"ok": True, "messages": rows}


async def cmd_export(out_dir: Path, since: str | None = None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    hist = await cmd_history(limit=500)
    path = out_dir / "transcript.json"
    path.write_text(json.dumps(hist, indent=2, ensure_ascii=False), encoding="utf-8")
    txt = out_dir / "transcript.txt"
    lines = []
    for m in hist["messages"]:
        if since and (m.get("ts") or "") < since:
            continue
        who = "DOC" if m["out"] else "ORCHID"
        lines.append(f"[{m.get('ts')}] {who}: {m.get('text')}")
    txt.write_text("\n".join(lines), encoding="utf-8")
    return {"ok": True, "dir": str(out_dir), "count": len(lines)}


async def cmd_voice_lock(limit: int = 50) -> dict[str, Any]:
    ensure_style_card()
    hist = await cmd_history(limit=limit)
    n = 0
    for m in hist["messages"]:
        if not m["out"]:
            continue
        text = (m.get("text") or "").strip()
        if not text:
            continue
        append_voice_lock(text, m.get("msg_id"))
        n += 1
    return {
        "ok": True,
        "appended": n,
        "style_card": str(ensure_style_card()),
    }


async def cmd_watch(hours: float = 10.0, overnight: bool = True) -> dict[str, Any]:
    """Log inbound only. No sends."""
    ensure_style_card()
    end = time.time() + hours * 3600
    seen: set[int] = set()
    async with connected_client() as client:
        orchid = await resolve_orchid(client)
        print(f"watching @{ORCHID_USERNAME} for {hours}h (sends disabled)")
        while time.time() < end:
            messages = await client.get_messages(orchid, limit=20)
            for msg in messages:
                if msg.out or not msg.id or msg.id in seen:
                    continue
                seen.add(msg.id)
                text = msg.message or ""
                _log_event(
                    {
                        "ts": _now_iso(),
                        "direction": "in",
                        "proactive_candidate": True,
                        "msg_id": msg.id,
                        "text": text,
                        "watch": True,
                    }
                )
                print(f"[watch inbound] {msg.id}: {text[:120]}")
            tier = "overnight" if overnight else "idle"
            from .waits import draw_tier

            await asyncio.sleep(min(draw_tier(tier), 900))
    return {"ok": True, "seen": len(seen)}
