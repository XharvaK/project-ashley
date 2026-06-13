from __future__ import annotations

import cuda_path  # noqa: F401 — must run before faster-whisper / ctranslate2

import logging
import threading
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import boot
from config import settings
from hotkey import start_global_hotkey
from stt import transcribe
from wake import Recorder, TranscriptWakeListener, WakeListener, strip_wake_prefix

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("voice-service")

wake_listener: WakeListener | None = None
phrase_listener: TranscriptWakeListener | None = None
recorder = Recorder()
pipeline_lock = threading.Lock()
busy = False
ptt_open = False


def _notify_ui(state: str, label: str) -> None:
    try:
        with httpx.Client(timeout=2.0) as client:
            client.post(
                f"{settings.agent_url}/ui-state",
                json={"state": state, "label": label},
            )
    except Exception:
        pass


def _is_busy() -> bool:
    return busy


def _is_ptt_open() -> bool:
    return ptt_open


def _pipeline_done() -> None:
    global busy
    busy = False
    _notify_ui("idle", "Ready")
    if wake_listener and boot.is_ready():
        wake_listener.reenable()
    if phrase_listener and boot.is_ready():
        phrase_listener.reenable()


def _run_chat(text: str) -> None:
    _notify_ui("thinking", "Thinking...")
    logger.info("Transcript: %s", text)
    with httpx.Client(timeout=120.0) as client:
        sess = client.post(f"{settings.agent_url}/session/start")
        sess.raise_for_status()
        session_id = sess.json()["sessionId"]
        chat = client.post(
            f"{settings.agent_url}/chat",
            json={"transcript": text, "sessionId": session_id},
        )
        chat.raise_for_status()


def _on_wake() -> None:
    if busy or not boot.is_ready():
        if wake_listener:
            wake_listener.reenable()
        return
    threading.Thread(target=_handle_utterance, daemon=True).start()


def _on_phrase_command(command: str) -> None:
    threading.Thread(target=_process_transcript, args=(command,), daemon=True).start()


def _process_transcript(text: str) -> None:
    global busy
    with pipeline_lock:
        if busy:
            if phrase_listener:
                phrase_listener.reenable()
            return
        busy = True
    try:
        _run_chat(text)
    except Exception as e:
        logger.exception("Pipeline error: %s", e)
        _notify_ui("error", "Voice pipeline error")
    finally:
        _pipeline_done()


def _handle_utterance() -> None:
    global busy
    with pipeline_lock:
        if busy:
            return
        busy = True
    try:
        _notify_ui("listening", "Listening...")
        logger.info("Listening for utterance...")
        audio = recorder.record_utterance()
        if audio.size < settings.sample_rate * 0.3:
            logger.info("Utterance too short, ignoring")
            return
        text, _lang = transcribe(audio)
        if not text:
            logger.info("Empty transcript")
            return
        _run_chat(text)
    except Exception as e:
        logger.exception("Pipeline error: %s", e)
        _notify_ui("error", "Voice pipeline error")
    finally:
        _pipeline_done()


def _toggle_ptt() -> dict:
    global ptt_open, busy

    if not boot.is_ready():
        raise HTTPException(503, "not ready")
    if busy and not ptt_open:
        raise HTTPException(409, "busy")

    if not ptt_open:
        ptt_open = True
        recorder.start_manual()
        _notify_ui("listening", "Dinliyorum… (kapat: Ctrl+Shift+Space)")
        logger.info("PTT toggle ON")
        return {"ok": True, "listening": True}

    ptt_open = False
    audio = recorder.stop_manual()
    _notify_ui("thinking", "Processing...")
    logger.info("PTT toggle OFF — processing")
    threading.Thread(target=_finish_toggle_ptt, args=(audio,), daemon=True).start()
    return {"ok": True, "listening": False}


def _finish_toggle_ptt(audio) -> None:
    global busy
    with pipeline_lock:
        if busy:
            return
        busy = True
    try:
        if audio.size < settings.sample_rate * 0.25:
            logger.info("Toggle utterance too short")
            return
        text, _lang = transcribe(audio)
        if not text:
            return
        command = strip_wake_prefix(text) or text.strip()
        if not command:
            return
        _run_chat(command)
    except Exception as e:
        logger.exception("Toggle pipeline error: %s", e)
        _notify_ui("error", "Voice pipeline error")
    finally:
        _pipeline_done()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global wake_listener, phrase_listener
    boot.boot()

    wake_listener = WakeListener(on_wake=_on_wake)
    wake_listener.start()

    phrase_listener = TranscriptWakeListener(
        on_command=_on_phrase_command,
        recorder=recorder,
        is_busy=_is_busy,
        is_ptt_open=_is_ptt_open,
    )
    if not settings.wake_model.exists():
        phrase_listener.start()

    if settings.ptt_hotkey:
        start_global_hotkey(_toggle_ptt)

    yield

    if wake_listener:
        wake_listener.stop()
    if phrase_listener:
        phrase_listener.stop()
    boot.pause()


app = FastAPI(title="Ashley Voice Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "ready": boot.is_ready(),
        "paused": boot.is_paused(),
        "busy": busy,
        "listening": ptt_open,
        "wake_model": settings.wake_model.exists(),
    }


class PttRequest(BaseModel):
    pass


@app.post("/ptt")
def push_to_talk(_req: PttRequest | None = None):
    return _toggle_ptt()


@app.post("/ptt/toggle")
def ptt_toggle(_req: PttRequest | None = None):
    return _toggle_ptt()


@app.post("/pause")
def pause():
    global wake_listener, phrase_listener
    if wake_listener:
        wake_listener.stop()
    if phrase_listener:
        phrase_listener.stop()
    boot.pause()
    return {"ok": True, "ready": boot.is_ready()}


@app.post("/boot")
def reboot():
    global wake_listener, phrase_listener
    boot.resume_boot()
    if wake_listener is None:
        wake_listener = WakeListener(on_wake=_on_wake)
    wake_listener.start()
    if phrase_listener is None:
        phrase_listener = TranscriptWakeListener(
            on_command=_on_phrase_command,
            recorder=recorder,
            is_busy=_is_busy,
            is_ptt_open=_is_ptt_open,
        )
    if not settings.wake_model.exists():
        phrase_listener.start()
    return {"ok": True, "ready": boot.is_ready()}


@app.post("/cancel")
def cancel():
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(f"{settings.agent_url}/cancel")
    except Exception:
        pass
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )
