from pathlib import Path
from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
DATA_DIR = Path.home() / ".composer-assistant"


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 3711
    agent_url: str = "http://127.0.0.1:3710"
    whisper_model: str = "large-v3-turbo"
    whisper_device: str = "cuda"
    whisper_compute: str = "float16"
    wake_model: Path = MODELS_DIR / "ashley.onnx"
    sample_rate: int = 16000
    vad_silence_sec: float = 1.2
    max_record_sec: float = 30.0
    ptt_hotkey: bool = True

    class Config:
        env_prefix = "VOICE_"


settings = Settings()
