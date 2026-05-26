import io
import shutil
import wave

import numpy as np
import pytest

from src.audio import decode_to_mono_16k, env_bool, noise_reduction_enabled, prepare_audio

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None,
    reason="ffmpeg not installed",
)


def _make_wav_bytes(duration_sec: float = 0.1, sample_rate: int = 16_000) -> bytes:
    n_samples = int(duration_sec * sample_rate)
    samples = np.zeros(n_samples, dtype=np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


class TestEnvBool:
    def test_true_values(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for val in ("true", "TRUE", "1", "yes", "on"):
            monkeypatch.setenv("TEST_FLAG", val)
            assert env_bool("TEST_FLAG") is True

    def test_false_values(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_FLAG", "false")
        assert env_bool("TEST_FLAG") is False
        monkeypatch.delenv("TEST_FLAG", raising=False)
        assert env_bool("TEST_FLAG", default=False) is False


class TestPrepareAudio:
    def test_decode_wav_bytes(self) -> None:
        wav = _make_wav_bytes(0.2)
        prepared = prepare_audio(wav)
        assert prepared["sample_rate"] == 16_000
        assert prepared["duration_seconds"] > 0
        assert prepared["samples"].dtype == np.float32
        assert len(prepared["samples"]) > 0

    def test_noise_reduction_flag_off(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STT_NOISE_REDUCTION", "false")
        assert noise_reduction_enabled() is False
        prepared = prepare_audio(_make_wav_bytes())
        assert prepared["noise_reduction_applied"] is False

    def test_noise_reduction_flag_on(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STT_NOISE_REDUCTION", "true")
        assert noise_reduction_enabled() is True
        prepared = prepare_audio(_make_wav_bytes())
        assert prepared["noise_reduction_applied"] is True

    def test_invalid_audio_raises(self) -> None:
        with pytest.raises(ValueError, match="ffmpeg decode failed"):
            decode_to_mono_16k(b"not-audio")
