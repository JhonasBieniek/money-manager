import os
from functools import lru_cache
from typing import Any

import numpy as np
from faster_whisper import WhisperModel

DEFAULT_MODEL = os.getenv("STT_MODEL", "small")
DEFAULT_LANGUAGE = os.getenv("STT_LANGUAGE", "pt")
DEFAULT_DEVICE = os.getenv("STT_DEVICE", "cpu")
DEFAULT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")


@lru_cache(maxsize=1)
def get_model(
    model_size: str = DEFAULT_MODEL,
    device: str = DEFAULT_DEVICE,
    compute_type: str = DEFAULT_COMPUTE_TYPE,
) -> WhisperModel:
    return WhisperModel(model_size, device=device, compute_type=compute_type)


def transcribe_samples(
    samples: np.ndarray,
    sample_rate: int,
    *,
    language: str | None = None,
) -> dict[str, Any]:
    model = get_model()
    lang = language or DEFAULT_LANGUAGE or None

    segments_iter, info = model.transcribe(
        samples,
        language=lang,
        beam_size=5,
        vad_filter=True,
    )

    segments: list[dict[str, Any]] = []
    texts: list[str] = []
    for segment in segments_iter:
        text = segment.text.strip()
        if text:
            texts.append(text)
        segments.append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
                "avg_logprob": float(segment.avg_logprob),
            }
        )

    return {
        "full_text": " ".join(texts).strip(),
        "language": info.language,
        "language_probability": float(info.language_probability),
        "duration_seconds": float(info.duration),
        "segments": segments,
    }
