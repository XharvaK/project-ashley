# Training wake word "Ashley"

```bash
cd openWakeWord
docker compose run --rm trainer python train.py --wake-word "ashley" --data-dir /app/data
```

Copy output `ashley.onnx` to `models/ashley.onnx`.

Until `ashley.onnx` exists, use push-to-talk (`Ctrl+Shift+Space`).
