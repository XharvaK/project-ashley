from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable

import numpy as np
import sounddevice as sd

from config import settings

logger = logging.getLogger(__name__)

CHUNK = 1280  # openWakeWord frame size at 16kHz

WAKE_PREFIX = re.compile(r"^(hey\s+)?ashley[,!.\s]+", re.IGNORECASE)


def strip_wake_prefix(text: str) -> str | None:
    cleaned = text.strip()
    if not cleaned:
        return None
    match = WAKE_PREFIX.match(cleaned)
    if match:
        rest = cleaned[match.end() :].strip()
        return rest if rest else None
    if re.search(r"\bashley\b", cleaned, re.IGNORECASE):
        return re.sub(r"(?i)\bashley\b[,!.\s]*", "", cleaned, count=1).strip() or None
    return None


class WakeListener:
    def __init__(
        self,
        on_wake: Callable[[], None],
        on_ptt: Callable[[], None] | None = None,
    ) -> None:
        self.on_wake = on_wake
        self.on_ptt = on_ptt
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._stream: sd.InputStream | None = None
        self._oww = None
        self._enabled = False

    def _init_oww(self) -> bool:
        if self._oww is not None:
            return True
        if not settings.wake_model.exists():
            return False
        try:
            from openwakeword.model import Model
            from openwakeword.utils import download_models

            download_models()
            self._oww = Model(
                wakeword_models=[str(settings.wake_model)],
                inference_framework="onnx",
            )
            logger.info("openWakeWord loaded: %s", settings.wake_model.name)
            return True
        except Exception as e:
            logger.error("openWakeWord init failed: %s", e)
            return False

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._enabled = True
        has_oww = self._init_oww()
        if not has_oww:
            logger.info(
                "Wake model missing at %s — using phrase detection (say 'Ashley, ...')",
                settings.wake_model,
            )
            return
        self._thread = threading.Thread(
            target=self._loop,
            args=(has_oww,),
            daemon=True,
            name="wake-listener",
        )
        self._thread.start()

    def stop(self) -> None:
        self._enabled = False
        self._stop.set()
        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

    def _loop(self, has_oww: bool) -> None:
        def callback(indata, _frames, _time, status):
            if status:
                logger.debug("audio status: %s", status)
            if not self._enabled:
                return
            pcm = (indata[:, 0] * 32767).astype(np.int16)
            if has_oww and self._oww is not None:
                pred = self._oww.predict(pcm)
                for _name, score in pred.items():
                    if score > 0.5:
                        logger.info("Wake word detected (score=%.2f)", score)
                        self._enabled = False
                        threading.Thread(target=self.on_wake, daemon=True).start()
                        break

        with sd.InputStream(
            samplerate=settings.sample_rate,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            callback=callback,
        ) as stream:
            self._stream = stream
            while not self._stop.is_set():
                time.sleep(0.1)

    def reenable(self) -> None:
        self._enabled = True


class TranscriptWakeListener:
    """Listen continuously; when speech ends, require 'Ashley' in the transcript."""

    def __init__(
        self,
        on_command: Callable[[str], None],
        recorder: "Recorder",
        *,
        is_busy: Callable[[], bool],
        is_ptt_open: Callable[[], bool],
    ) -> None:
        self.on_command = on_command
        self.recorder = recorder
        self.is_busy = is_busy
        self.is_ptt_open = is_ptt_open
        self._stop = threading.Event()
        self._enabled = True
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._enabled = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="phrase-wake")
        self._thread.start()
        logger.info("Phrase wake active — say 'Ashley, ...'")

    def stop(self) -> None:
        self._enabled = False
        self._stop.set()

    def reenable(self) -> None:
        self._enabled = True

    def _loop(self) -> None:
        while not self._stop.is_set():
            if not self._enabled or self.is_busy() or self.is_ptt_open():
                time.sleep(0.15)
                continue
            try:
                audio = self.recorder.record_utterance()
            except Exception as e:
                logger.warning("Phrase wake record error: %s", e)
                time.sleep(0.3)
                continue
            if audio.size < settings.sample_rate * 0.35:
                continue
            if not self._enabled or self.is_busy() or self.is_ptt_open():
                continue
            self._handle_audio(audio)

    def _handle_audio(self, audio: np.ndarray) -> None:
        from stt import transcribe

        text, _lang = transcribe(audio)
        if not text:
            return
        logger.info("Heard: %s", text)
        command = strip_wake_prefix(text)
        if not command:
            return
        logger.info("Ashley command: %s", command)
        self._enabled = False
        self.on_command(command)


class Recorder:
    """Record from mic until silence, max duration, or manual stop (toggle PTT)."""

    def __init__(self) -> None:
        self._manual_stop = threading.Event()
        self._manual_active = False
        self._manual_chunks: list[np.ndarray] = []
        self._manual_lock = threading.Lock()
        self._manual_stream: sd.InputStream | None = None

    def record_utterance(self) -> np.ndarray:
        silence_chunks = 0
        silence_threshold = int(settings.vad_silence_sec * settings.sample_rate / CHUNK)
        max_chunks = int(settings.max_record_sec * settings.sample_rate / CHUNK)
        chunks: list[np.ndarray] = []
        heard_speech = False

        def callback(indata, frames, _time, status):
            nonlocal silence_chunks, heard_speech
            if status:
                logger.debug("rec status: %s", status)
            mono = indata[:, 0].copy()
            rms = float(np.sqrt(np.mean(mono**2)))
            if rms > 0.02:
                heard_speech = True
                silence_chunks = 0
            elif heard_speech:
                silence_chunks += 1
            chunks.append(mono)

        with sd.InputStream(
            samplerate=settings.sample_rate,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            callback=callback,
        ):
            for _ in range(max_chunks):
                time.sleep(CHUNK / settings.sample_rate)
                if heard_speech and silence_chunks >= silence_threshold:
                    break

        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks)

    def start_manual(self) -> None:
        with self._manual_lock:
            self._manual_chunks = []
            self._manual_stop.clear()
            self._manual_active = True

        def callback(indata, _frames, _time, status):
            if status:
                logger.debug("manual rec status: %s", status)
            if not self._manual_active:
                return
            with self._manual_lock:
                self._manual_chunks.append(indata[:, 0].copy())

        self._manual_stream = sd.InputStream(
            samplerate=settings.sample_rate,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            callback=callback,
        )
        self._manual_stream.start()

    def stop_manual(self) -> np.ndarray:
        self._manual_active = False
        self._manual_stop.set()
        try:
            if self._manual_stream:
                self._manual_stream.stop()
                self._manual_stream.close()
        except Exception:
            pass
        self._manual_stream = None
        with self._manual_lock:
            if not self._manual_chunks:
                return np.zeros(0, dtype=np.float32)
            return np.concatenate(self._manual_chunks)

    @property
    def manual_active(self) -> bool:
        return self._manual_active
