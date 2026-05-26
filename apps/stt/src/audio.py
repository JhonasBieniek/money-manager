import io
import os
import subprocess
from typing import Any

import noisereduce as nr
import numpy as np
import soundfile as sf

TARGET_SAMPLE_RATE = 16_000


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def noise_reduction_enabled() -> bool:
    return env_bool("STT_NOISE_REDUCTION", default=False)


def decode_to_mono_16k(audio_bytes: bytes) -> tuple[np.ndarray, float]:
    """Decode arbitrary audio bytes to float32 mono 16 kHz via ffmpeg."""
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "wav",
            "-acodec",
            "pcm_s16le",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "pipe:1",
        ],
        input=audio_bytes,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"ffmpeg decode failed: {stderr or proc.returncode}")

    data, sample_rate = sf.read(io.BytesIO(proc.stdout), dtype="float32")
    if data.ndim > 1:
        data = np.mean(data, axis=1)

    duration = float(len(data) / sample_rate) if sample_rate else 0.0
    return data.astype(np.float32), duration


def apply_noise_reduction(samples: np.ndarray, sample_rate: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    reduced = nr.reduce_noise(y=samples, sr=sample_rate, stationary=True, prop_decrease=0.75)
    return reduced.astype(np.float32)


def prepare_audio(audio_bytes: bytes) -> dict[str, Any]:
    """Decode bytes and optionally denoise. Returns samples + metadata."""
    samples, duration = decode_to_mono_16k(audio_bytes)
    denoise = noise_reduction_enabled()
    if denoise:
        samples = apply_noise_reduction(samples)
    return {
        "samples": samples,
        "sample_rate": TARGET_SAMPLE_RATE,
        "duration_seconds": duration,
        "noise_reduction_applied": denoise,
    }
