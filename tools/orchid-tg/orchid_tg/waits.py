from __future__ import annotations

import random
import time
from typing import Mapping

TIERS: Mapping[str, tuple[float, float]] = {
    "micro": (0.4, 1.8),
    "short": (2.0, 8.0),
    "gap": (10.0, 30.0),
    "reply": (30.0, 90.0),
    "think": (60.0, 300.0),
    "idle": (300.0, 1800.0),
    "long": (1800.0, 3600.0),
    "overnight": (3600.0, 7200.0),
}

OP_DEFAULT_TIER = {
    "pre_send": "short",
    "inter_bubble": "gap",
    "wait_reply": "reply",
    "idle_poll": "idle",
    "overnight_poll": "overnight",
    "reconnect": "short",
}


def draw_tier(name: str) -> float:
    if name not in TIERS:
        raise ValueError(f"unknown wait tier: {name}")
    lo, hi = TIERS[name]
    return random.uniform(lo, hi)


def draw_band(lo: float, hi: float) -> float:
    if hi < lo:
        lo, hi = hi, lo
    return random.uniform(lo, hi)


def wait_tier(name: str) -> float:
    delay = draw_tier(name)
    time.sleep(delay)
    return delay


def wait_band(lo: float, hi: float) -> float:
    delay = draw_band(lo, hi)
    time.sleep(delay)
    return delay


def reading_time_seconds(text: str) -> float:
    chars = max(len(text or ""), 1)
    wpm = random.uniform(180.0, 280.0)
    words = chars / 5.0
    seconds = (words / wpm) * 60.0
    return max(3.0, min(90.0, seconds))


def wait_reading(text: str) -> float:
    delay = reading_time_seconds(text)
    time.sleep(delay)
    wait_tier("micro")
    return delay
