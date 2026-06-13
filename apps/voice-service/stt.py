from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np

from config import settings

logger = logging.getLogger(__name__)

_model: Any = None


def is_loaded() -> bool:
    return _model is not None


def load_model() -> None:
    global _model
    if _model is not None:
        return
    from faster_whisper import WhisperModel

    logger.info(
        "Loading Whisper %s on %s (%s)...",
        settings.whisper_model,
        settings.whisper_device,
        settings.whisper_compute,
    )
    t0 = time.perf_counter()
    _model = WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute,
    )
    logger.info("Whisper loaded in %.2fs", time.perf_counter() - t0)


def unload_model() -> None:
    global _model
    if _model is None:
        return
    _model = None
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass
    logger.info("Whisper unloaded")


def warmup() -> None:
    load_model()
    audio = np.zeros(settings.sample_rate, dtype=np.float32)
    segments, _ = _model.transcribe(audio, language="en")
    list(segments)
    logger.info("Whisper warmup done")


def transcribe(audio: np.ndarray) -> tuple[str, str]:
    load_model()
    if audio.dtype != np.float32:
        audio = audio.astype(np.float32)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    segments, info = _model.transcribe(audio, language="en")
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, info.language or "en"
