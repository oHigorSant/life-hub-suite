"""Sintetiza várias falas com Piper (local, CPU). Entrada JSON no stdin:
{"items":[{"voice":"/m/x.onnx","text":"...","speed":1.0,"out":"/tmp/a.wav"}, ...]}
Carrega cada modelo uma única vez. Saída (última linha): {"durations":[segundos,...]}"""
import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig

req = json.load(sys.stdin)
cache = {}
durations = []
for it in req["items"]:
    voice = cache.get(it["voice"]) or cache.setdefault(it["voice"], PiperVoice.load(it["voice"]))
    speed = max(0.5, min(2.0, float(it.get("speed") or 1.0)))
    cfg = SynthesisConfig(length_scale=1.0 / speed)
    total = 0.0
    with wave.open(it["out"], "wb") as wav:
        rate = None
        for chunk in voice.synthesize(it["text"], syn_config=cfg):
            if rate is None:
                rate = chunk.sample_rate
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(rate)
            wav.writeframes(chunk.audio_int16_bytes)
            total += len(chunk.audio_int16_bytes) / 2 / rate
    durations.append(round(total, 2))
print(json.dumps({"durations": durations}))
