"""Transcreve áudio/vídeo com faster-whisper e imprime JSON: [{start, end, text}]."""
import json
import os
import sys

from faster_whisper import WhisperModel

path = sys.argv[1]
model_dir = os.environ.get("WHISPER_MODEL", os.path.expanduser("~/models/whisper-turbo"))
lang = os.environ.get("WHISPER_LANG") or None

model = WhisperModel(model_dir, device="cpu", compute_type="int8")
segments, info = model.transcribe(path, language=lang, vad_filter=True, beam_size=1)
out = [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()} for s in segments]
print(json.dumps({"language": info.language, "duration": info.duration, "segments": out}, ensure_ascii=False))
