from unittest.mock import patch
import io
import shutil
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_transcribe_missing_file() -> None:
    res = client.post("/transcribe", files={})
    assert res.status_code == 400
    assert res.json()["detail"] == "Missing audio file"


def test_transcribe_empty_file() -> None:
    res = client.post(
        "/transcribe",
        files={"audio": ("empty.ogg", b"", "audio/ogg")},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Empty audio"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_transcribe_success() -> None:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16_000)
        wf.writeframes(np.zeros(1600, dtype=np.int16).tobytes())

    mock_result = {
        "full_text": "gastei cinquenta reais",
        "language": "pt",
        "language_probability": 0.95,
        "duration_seconds": 0.1,
        "segments": [{"start": 0.0, "end": 0.1, "text": "gastei cinquenta reais", "avg_logprob": -0.2}],
    }

    with patch("src.main.transcribe_samples", return_value=mock_result):
        res = client.post(
            "/transcribe",
            files={"audio": ("voice.ogg", buf.getvalue(), "audio/ogg")},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["full_text"] == "gastei cinquenta reais"
    assert body["language"] == "pt"
    assert "noise_reduction_applied" in body
