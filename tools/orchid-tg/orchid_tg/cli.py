from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from . import client as tg
from . import loop as orchid_loop
from .gates import ensure_incident_lock_seeded
from .voice_lock import ensure_style_card, load_voice_lock, voice_lock_count
from .waits import TIERS


def _print(obj: object) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def _parse_band(raw: str | None) -> tuple[float, float] | None:
    if not raw:
        return None
    if ":" not in raw:
        raise SystemExit("--wait-band must be MIN:MAX")
    a, b = raw.split(":", 1)
    return float(a), float(b)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="orchid-tg")
    sub = p.add_subparsers(dest="cmd", required=True)

    login = sub.add_parser("login", help="Phone+code login (no QR)")
    login.add_argument(
        "--phone",
        default=None,
        help="E.164 phone, e.g. +905xxxxxxxxx (step 1: request code)",
    )
    login.add_argument(
        "--code",
        default=None,
        help="Login code from Telegram/SMS (step 2)",
    )
    login.add_argument(
        "--password",
        default=None,
        help="Cloud 2FA password if enabled",
    )
    sub.add_parser("status", help="Auth + orchid peer status")

    send = sub.add_parser("send", help="Send as Doc (linted + gated)")
    send.add_argument("--text", required=True)
    send.add_argument("--file", type=Path, default=None)
    send.add_argument("--wait-tier", choices=sorted(TIERS.keys()), default=None)
    send.add_argument("--wait-band", default=None, help="MIN:MAX seconds")
    send.add_argument("--no-wait", action="store_true")
    send.add_argument(
        "--force-unrelated",
        default=None,
        help="Skip open-question gate only; reason length >= 8",
    )

    wait = sub.add_parser("wait", help="Wait for Orchid reply")
    wait.add_argument("--wait-tier", choices=sorted(TIERS.keys()), default="reply")
    wait.add_argument("--wait-band", default=None)
    wait.add_argument("--after-id", type=int, default=None)

    hist = sub.add_parser("history", help="Recent messages JSON")
    hist.add_argument("--limit", type=int, default=40)

    exp = sub.add_parser("export", help="Export transcript")
    exp.add_argument("--out", type=Path, required=True)
    exp.add_argument("--since", default=None)

    vl = sub.add_parser("voice-lock", help="Pull Doc outbounds into corpus")
    vl.add_argument("--limit", type=int, default=50)

    watch = sub.add_parser("watch", help="Overnight inbound logger (no send)")
    watch.add_argument("--hours", type=float, default=10.0)
    watch.add_argument("--daytime", action="store_true")

    sub.add_parser("style-card", help="Ensure bootstrap style card exists")

    turn = sub.add_parser(
        "turn",
        help="Cover-safe director turn (draft file → gated send)",
    )
    turn.add_argument(
        "--wait-reply",
        action="store_true",
        help="After send or while waiting_on_orchid, wait for Orchid",
    )
    turn.add_argument("--wait-tier", choices=sorted(TIERS.keys()), default="reply")
    turn.add_argument(
        "--status",
        action="store_true",
        help="Print loop/incident status only",
    )

    incident = sub.add_parser(
        "incident",
        help="Post-cover-incident lock (Doc CLEAR required)",
    )
    inc_sub = incident.add_subparsers(dest="incident_cmd", required=True)
    inc_sub.add_parser("status", help="Show lock state")
    inc_clear = inc_sub.add_parser(
        "clear",
        help="Unlock after Doc types CLEAR in Cursor",
    )
    inc_clear.add_argument("--by", default="doc")

    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    try:
        if args.cmd == "login":
            _print(
                asyncio.run(
                    tg.cmd_login(
                        phone=args.phone,
                        code=args.code,
                        password=args.password,
                    )
                )
            )
        elif args.cmd == "status":
            _print(asyncio.run(tg.cmd_status()))
        elif args.cmd == "send":
            result = asyncio.run(
                tg.cmd_send(
                    args.text,
                    wait_tier_name=args.wait_tier,
                    wait_band=_parse_band(args.wait_band),
                    file=args.file,
                    no_wait=args.no_wait,
                    force_unrelated=args.force_unrelated,
                )
            )
            _print(result)
            if not result.get("ok"):
                sys.exit(2)
        elif args.cmd == "wait":
            _print(
                asyncio.run(
                    tg.cmd_wait(
                        wait_tier_name=args.wait_tier,
                        wait_band=_parse_band(args.wait_band),
                        after_id=args.after_id,
                    )
                )
            )
        elif args.cmd == "history":
            _print(asyncio.run(tg.cmd_history(limit=args.limit)))
        elif args.cmd == "export":
            _print(asyncio.run(tg.cmd_export(args.out, since=args.since)))
        elif args.cmd == "voice-lock":
            _print(asyncio.run(tg.cmd_voice_lock(limit=args.limit)))
        elif args.cmd == "watch":
            _print(
                asyncio.run(
                    tg.cmd_watch(hours=args.hours, overnight=not args.daytime)
                )
            )
        elif args.cmd == "style-card":
            path = ensure_style_card()
            _print(
                {
                    "ok": True,
                    "style_card": str(path),
                    "voice_lock_lines": voice_lock_count(),
                    "sample": load_voice_lock(5),
                }
            )
        elif args.cmd == "turn":
            ensure_incident_lock_seeded()
            if args.status:
                _print(orchid_loop.turn_status())
            else:
                result = asyncio.run(
                    orchid_loop.cmd_turn(
                        wait_for_reply=args.wait_reply,
                        wait_tier_name=args.wait_tier,
                    )
                )
                _print(result)
                if not result.get("ok"):
                    sys.exit(2)
        elif args.cmd == "incident":
            if args.incident_cmd == "status":
                _print(orchid_loop.cmd_incident_status())
            elif args.incident_cmd == "clear":
                _print(orchid_loop.cmd_incident_clear(by=args.by))
            else:
                raise SystemExit(f"unknown incident cmd {args.incident_cmd}")
        else:
            raise SystemExit(f"unknown cmd {args.cmd}")
    except KeyboardInterrupt:
        print(json.dumps({"ok": False, "error": "interrupted"}))
        sys.exit(130)


if __name__ == "__main__":
    main()
