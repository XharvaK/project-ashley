from __future__ import annotations

import re
from dataclasses import dataclass, field

EM_EN_DASH = re.compile(r"[\u2014\u2013]")
CURLY_QUOTES = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
}
ASSISTANT_PHRASE = re.compile(
    r"(?i)\b("
    r"i'?d be happy to|absolutely!?|great question|"
    r"it'?s worth noting|delve|tapestry|"
    r"as an ai|i'?m an ai"
    r")\b"
)
NOT_X_BUT_Y = re.compile(r"(?i)\bnot\s+[^,]{2,40},\s+but\s+")
MARKDOWN = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*|^#{1,3}\s|^\s*[-*]\s)", re.M)
TIPOFF = re.compile(
    r"(?i)("
    r"\b("
    r"telethon|mtproto|userbot|cursor|claude|grok|gpt|llm|"
    r"datamine|probe|harness|voice-lock|style card|orchid-tg|"
    r"falsifier|wait tier|system prompt|reverse.?engineer|"
    r"automation|bot test|test case|matrix\b"
    r")\b|"
    r"\(TEST\)|TEST:|"
    r"keep it short|"
    r"quick note for later|"
    r"calendar spam|"
    r"just chatting,\s*not work stuff|"
    r"ping me around\s*8:30"
    r")"
)
SENSITIVE = re.compile(
    r"(?i)("
    r"\bsk-[a-z0-9]{10,}\b|"
    r"\bapi[_-]?key\b|"
    r"\bpassword\b|"
    r"gmail\.com/|"
    r"accounts\.google|"
    r"oauth|"
    r"connect (my )?(gmail|google|calendar|drive|slack)\b|"
    r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"
    r")"
)
EMOJI = re.compile(
    "["
    "\U0001F300-\U0001F9FF"
    "\U00002700-\U000027BF"
    "\U0001F600-\U0001F64F"
    "]+"
)


@dataclass
class LintResult:
    ok: bool
    text: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def normalize_text(text: str) -> str:
    out = text
    for src, dst in CURLY_QUOTES.items():
        out = out.replace(src, dst)
    out = out.replace("\u00a0", " ")
    # Prefer comma/period over dash theater
    out = re.sub(r"\s*[\u2014\u2013]\s*", ", ", out)
    out = re.sub(r" {2,}", " ", out)
    return out.strip()


def lint_outbound(text: str, *, harden: bool = True) -> LintResult:
    normalized = normalize_text(text) if harden else text
    errors: list[str] = []
    warnings: list[str] = []

    if EM_EN_DASH.search(normalized):
        errors.append("em_or_en_dash")
    if MARKDOWN.search(normalized):
        errors.append("markdown")
    if TIPOFF.search(normalized):
        errors.append("tipoff_phrase")
    if SENSITIVE.search(normalized):
        errors.append("sensitive_or_oauth")

    if ASSISTANT_PHRASE.search(normalized):
        warnings.append("assistant_phrase")
    if NOT_X_BUT_Y.search(normalized):
        warnings.append("not_x_but_y")
    if normalized.count(";") >= 2:
        warnings.append("semicolon_glue")
    if len(EMOJI.findall(normalized)) >= 2:
        warnings.append("emoji_spam")

    return LintResult(
        ok=len(errors) == 0,
        text=normalized,
        errors=errors,
        warnings=warnings,
    )
