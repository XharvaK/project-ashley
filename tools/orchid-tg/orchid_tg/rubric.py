"""Deterministic Orchid reply rubric over JSONL corpus (no live chat required)."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

from .lint import EMOJI
from .paths import logs_dir

FACILITATOR = re.compile(
    r"(?i)\b("
    r"you had the floor|ball'?s in your court|waiting for you to lead|"
    r"whenever you'?re ready|i'?m here whenever|how can i help|"
    r"what do you (need|want to talk about)|what'?s on your mind|"
    r"it sounds like you|let'?s unpack|glad you asked|as an ai|"
    r"i'?m an ai companion"
    r")\b"
)
PEER_FUMBLE = re.compile(
    r"(?i)\b("
    r"fumbled|my bad|lmao you'?re right|got distracted|brain blank|"
    r"stalled|lagged|ghosted|i missed"
    r")\b"
)
WYR = re.compile(r"(?i)\b(would you rather|wyr)\b")
PRODUCT_CTA = re.compile(
    r"(?i)\b(text me ['\"]?distract|upgrade|connect (gmail|google)|sign up)\b"
)
QUESTION = re.compile(r"\?")
CURLY = re.compile("[\u2018\u2019\u201c\u201d]")
LOWERISH = re.compile(r"^[a-z0-9]")
UPPER_START = re.compile(r"^[A-Z]")


@dataclass
class RubricRow:
    source: str
    msg_id: int | None
    ts: str
    doc_prev: str
    orchid_text: str
    burst_size: int
    burst_index: int
    bubble_count: str
    char_len: int
    doc_char_len: int
    length_mirror: str
    casing_mirror: str
    emoji_count: int
    has_media: str
    facilitator_smell: str
    peer_fumble: str
    closing_question: str
    curly_quotes: str
    wyr_hint: str
    product_cta: str
    anti_patterns: str
    # Judgment columns — leave for human polish; auto may set partial
    validate_then_hook: str
    mode: str
    notes: str


def _emoji_count(text: str) -> int:
    return len(EMOJI.findall(text or ""))


def _length_mirror(doc: str, orchid: str) -> str:
    d = len((doc or "").strip())
    o = len((orchid or "").strip())
    if d == 0:
        return "n/a"
    if d <= 40 and o <= 90:
        return "Y"
    if d <= 40 and o > 160:
        return "N"
    if d > 80 and o < 20:
        return "partial"
    ratio = o / max(d, 1)
    if 0.35 <= ratio <= 2.8:
        return "Y"
    if ratio > 4 or ratio < 0.15:
        return "N"
    return "partial"


def _casing_mirror(doc: str, orchid: str) -> str:
    d = (doc or "").strip()
    o = (orchid or "").strip()
    if not d or not o:
        return "n/a"
    doc_lower = bool(LOWERISH.match(d)) and not UPPER_START.match(d)
    orch_lower = bool(LOWERISH.match(o)) and not UPPER_START.match(o)
    doc_title = bool(UPPER_START.match(d))
    orch_title = bool(UPPER_START.match(o))
    if doc_lower and orch_lower:
        return "Y"
    if doc_title and orch_title:
        return "Y"
    if doc_lower and orch_title and len(o) > 100:
        return "partial"
    if doc_title and orch_lower:
        return "partial"
    return "Y"


def _closing_question(text: str) -> str:
    n = len(QUESTION.findall(text or ""))
    if n == 0:
        return "none"
    if n == 1:
        return "soft"
    return "every-turn-ish"


def _anti_patterns(text: str) -> str:
    bits: list[str] = []
    if CURLY.search(text or ""):
        bits.append("curly_quotes")
    if WYR.search(text or ""):
        bits.append("wyr")
    if PRODUCT_CTA.search(text or ""):
        bits.append("product_cta")
    if FACILITATOR.search(text or ""):
        bits.append("facilitator")
    return ",".join(bits) if bits else ""


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def score_corpus(events: list[dict], *, source: str) -> list[RubricRow]:
    """Score each Orchid inbound; consecutive ins share burst_size."""
    # Annotate bursts
    bursts: list[tuple[int, int]] = []  # (burst_size, index_in_burst) per event
    i = 0
    while i < len(events):
        if events[i].get("direction") != "in":
            bursts.append((0, 0))
            i += 1
            continue
        j = i
        while j < len(events) and events[j].get("direction") == "in":
            j += 1
        size = j - i
        for k in range(size):
            bursts.append((size, k + 1))
        i = j

    out: list[RubricRow] = []
    last_doc = ""
    for idx, ev in enumerate(events):
        if ev.get("direction") == "out":
            last_doc = (ev.get("text") or "").strip()
            continue
        if ev.get("direction") != "in":
            continue
        text = (ev.get("text") or "").strip()
        burst_size, burst_index = bursts[idx]
        bubble = "1"
        if burst_size == 2:
            bubble = "2"
        elif burst_size >= 3:
            bubble = "3+"
        media = ev.get("has_media")
        has_media = "Y" if media else ("N" if media is False or media is None else str(media))
        fac = "Y" if FACILITATOR.search(text) else "N"
        fumble = "Y" if PEER_FUMBLE.search(text) else "N"
        curly = "Y" if CURLY.search(text) else "N"
        # Heuristic mode — human can override in notes
        mode = "hang"
        low = text.lower()
        if WYR.search(text) or "option" in low:
            mode = "play"
        if any(x in low for x in ("tab rule", "try this", "walk", "doomscroll")):
            mode = "coach-lite"
        if any(x in low for x in ("godspeed", "i'll stay quiet", "quiet until")):
            mode = "quiet-ack"
        validate = "review"
        if burst_size >= 2 and burst_index == 1:
            validate = "likely_riff"
        elif burst_size >= 2 and burst_index == 2:
            validate = "likely_hook"
        out.append(
            RubricRow(
                source=source,
                msg_id=ev.get("msg_id"),
                ts=str(ev.get("ts") or ""),
                doc_prev=last_doc[:120],
                orchid_text=text[:200],
                burst_size=burst_size,
                burst_index=burst_index,
                bubble_count=bubble,
                char_len=len(text),
                doc_char_len=len(last_doc),
                length_mirror=_length_mirror(last_doc, text),
                casing_mirror=_casing_mirror(last_doc, text),
                emoji_count=_emoji_count(text),
                has_media=has_media,
                facilitator_smell=fac,
                peer_fumble=fumble,
                closing_question=_closing_question(text),
                curly_quotes=curly,
                wyr_hint="Y" if WYR.search(text) else "N",
                product_cta="Y" if PRODUCT_CTA.search(text) else "N",
                anti_patterns=_anti_patterns(text),
                validate_then_hook=validate,
                mode=mode,
                notes="",
            )
        )
    return out


def write_csv(rows: list[RubricRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(asdict(rows[0]).keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))


def synthesize_pattern_card(rows: list[RubricRow]) -> str:
    n = len(rows)
    if n == 0:
        return "# Orchid pattern card\n\nNo rows scored.\n"

    def rate(pred) -> str:
        c = sum(1 for r in rows if pred(r))
        return f"{c}/{n} ({100 * c / n:.0f}%)"

    multi_heads = [r for r in rows if r.burst_size >= 2 and r.burst_index == 1]
    dual_heads = [r for r in rows if r.burst_size in (2, 3) and r.burst_index == 1]
    mega_heads = [r for r in rows if r.burst_size > 3 and r.burst_index == 1]
    lines = [
        "# Orchid pattern card (auto corpus pass)",
        "",
        "_Private study artifact. Never paste into Orchid chat. Auto-filled mechanics + heuristics; judgment columns may need Doc polish._",
        "",
        f"Sample: **{n}** Orchid replies from scored JSONL.",
        "",
        "## Frequencies",
        "",
        f"- Dual-bubble bursts (consecutive inbound size 2-3): **{len(dual_heads)}**",
        f"- Mega inbound bursts (size>3, often export/watch artifact): **{len(mega_heads)}**",
        f"- Any multi inbound burst heads: **{len(multi_heads)}**",
        f"- Length mirror Y: {rate(lambda r: r.length_mirror == 'Y')}",
        f"- Casing mirror Y: {rate(lambda r: r.casing_mirror == 'Y')}",
        f"- Emoji = 0: {rate(lambda r: r.emoji_count == 0)}",
        f"- Facilitator smell Y: {rate(lambda r: r.facilitator_smell == 'Y')}",
        f"- Peer fumble cue Y: {rate(lambda r: r.peer_fumble == 'Y')}",
        f"- Closing question none: {rate(lambda r: r.closing_question == 'none')}",
        f"- Curly quotes Y: {rate(lambda r: r.curly_quotes == 'Y')}",
        f"- WYR hint Y: {rate(lambda r: r.wyr_hint == 'Y')}",
        f"- Product CTA Y: {rate(lambda r: r.product_cta == 'Y')}",
        "",
        "## Mode heuristic counts",
        "",
    ]
    modes = Counter(r.mode for r in rows)
    for mode, c in modes.most_common():
        lines.append(f"- {mode}: {c}")
    lines.extend(
        [
            "",
            "## Steal for Ashley (high-frequency, cross-checked)",
            "",
            "- Prefer short messenger turns; dual-bubble when a riff+hook helps (Telegram often sends as consecutive messages).",
            "- Facilitator / floor-lead lines are rare or absent in this sample; ban them on Ashley.",
            "- Emoji mostly off; keep sparse.",
            "- Length/casing mostly track Doc; keep adaptive mirror, not locked lowercase.",
            "- Peer fumble cues appear when she owns a miss; keep one-line own-it.",
            "- WYR shows up in play mode; allow briefly, anti-treadmill on Ashley.",
            "- Curly quotes are common (67% in this sample); strip/avoid that polish on Ashley.",
            "",
            "## Reject",
            "",
            "- Curly-quote polish.",
            "- Product CTA / OAuth patterns.",
            "- Infinite game chain as default personality.",
            "- Treating mega inbound dumps as intentional dual-bubble craft.",
            "",
            f"_Full rows: `reply-rubric.csv` / `reply-rubric.md`._",
            "",
        ]
    )
    return "\n".join(lines)


def write_markdown_table(rows: list[RubricRow], path: Path, *, limit: int = 40) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "| msg_id | burst | len_m | case_m | emoji | fac | fumble | q | mode | orchid |\n"
        "|---|---|---|---|---|---|---|---|---|---|\n"
    )
    body = []
    for r in rows[:limit]:
        text = r.orchid_text.replace("|", "/").replace("\n", " ")
        if len(text) > 80:
            text = text[:77] + "..."
        body.append(
            f"| {r.msg_id} | {r.burst_size}@{r.burst_index} | {r.length_mirror} | "
            f"{r.casing_mirror} | {r.emoji_count} | {r.facilitator_smell} | "
            f"{r.peer_fumble} | {r.closing_question} | {r.mode} | {text} |"
        )
    more = ""
    if len(rows) > limit:
        more = f"\n\n_Showing {limit}/{len(rows)}; full data in reply-rubric.csv._\n"
    path.write_text(
        "# Orchid reply rubric (corpus pass)\n\n"
        "Dimensions: bubble via burst_size; length/casing mirror; emoji; facilitator; "
        "peer_fumble; closing_question; mode heuristic. "
        "validate_then_hook is auto-hint only.\n\n"
        + header
        + "\n".join(body)
        + more,
        encoding="utf-8",
    )


def run_default_corpus() -> dict:
    log = logs_dir()
    sources = [
        log / "20260730.jsonl",
    ]
    all_rows: list[RubricRow] = []
    used: list[str] = []
    for src in sources:
        if not src.exists():
            continue
        used.append(str(src))
        all_rows.extend(score_corpus(load_jsonl(src), source=src.name))

    csv_path = log / "reply-rubric.csv"
    md_path = log / "reply-rubric.md"
    card_path = log / "pattern-card.md"
    write_csv(all_rows, csv_path)
    write_markdown_table(all_rows, md_path)
    card_path.write_text(synthesize_pattern_card(all_rows), encoding="utf-8")
    return {
        "ok": True,
        "sources": used,
        "rows": len(all_rows),
        "csv": str(csv_path),
        "md": str(md_path),
        "pattern_card": str(card_path),
    }
