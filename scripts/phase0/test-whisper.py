#!/usr/bin/env python3
"""Phase 0: Whisper large-v3-turbo CUDA smoke test."""
import sys
import time
import numpy as np

def main():
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Install: pip install faster-whisper")
        sys.exit(1)

    print("[whisper] loading large-v3-turbo on CUDA fp16...")
    t0 = time.perf_counter()
    model = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16")
    print(f"[whisper] loaded in {time.perf_counter() - t0:.2f}s")

    # 1 second silence warmup
    audio = np.zeros(16000, dtype=np.float32)
    t1 = time.perf_counter()
    segments, info = model.transcribe(audio, language="en")
    list(segments)
    print(f"[whisper] warmup in {time.perf_counter() - t1:.2f}s lang={info.language}")

  # Optional: pass wav path as argv[1]
    if len(sys.argv) > 1:
        import soundfile as sf
        data, sr = sf.read(sys.argv[1], dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        t2 = time.perf_counter()
        segments, info = model.transcribe(data, language="en")
        text = " ".join(s.text.strip() for s in segments)
        print(f"[whisper] transcribe in {time.perf_counter() - t2:.2f}s: {text!r}")

    print("[whisper] OK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
