from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile

from src.audio import prepare_audio
from src.transcribe import transcribe_samples

app = FastAPI(title="money-manager-stt", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_multipart(
    audio: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    if audio is None:
        raise HTTPException(status_code=400, detail="Missing audio file")
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")

    try:
        prepared = prepare_audio(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = transcribe_samples(
        prepared["samples"],
        prepared["sample_rate"],
    )

    return {
        **result,
        "duration_seconds": prepared["duration_seconds"],
        "noise_reduction_applied": prepared["noise_reduction_applied"],
    }
