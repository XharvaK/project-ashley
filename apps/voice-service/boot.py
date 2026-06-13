from __future__ import annotations

import logging

from stt import is_loaded, load_model, unload_model, warmup

logger = logging.getLogger(__name__)

_ready = False
_paused = False


def is_ready() -> bool:
    return _ready and not _paused


def is_paused() -> bool:
    return _paused


def boot() -> None:
    global _ready, _paused
    _paused = False
    load_model()
    warmup()
    _ready = True
    logger.info("Voice service boot complete")


def pause() -> None:
    global _ready, _paused
    _paused = True
    _ready = False
    unload_model()
    logger.info("Voice service paused (GPU freed)")


def resume_boot() -> None:
    global _ready, _paused
    boot()
