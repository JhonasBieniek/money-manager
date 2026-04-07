import base64
import io
import os
from functools import lru_cache
from typing import Any

import easyocr
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

DEFAULT_LANGS = [s.strip() for s in os.getenv("OCR_LANGUAGES", "pt,en").split(",") if s.strip()]


@lru_cache(maxsize=1)
def get_reader(langs: tuple[str, ...]) -> easyocr.Reader:
    return easyocr.Reader(list(langs), gpu=False)


app = FastAPI(title="money-manager-ocr", version="0.0.0")


class OcrBody(BaseModel):
    image_base64: str = Field(..., description="PNG/JPEG como base64 (sem prefixo data:)")


def _aggregate_confidence(lines: list[list[Any]]) -> float:
    scores: list[float] = []
    for _box, text, conf in lines:
        if text and conf is not None:
            try:
                scores.append(float(conf))
            except (TypeError, ValueError):
                continue
    if not scores:
        return 0.0
    return max(0.0, min(1.0, sum(scores) / len(scores)))


def _run_ocr(image_bytes: bytes) -> dict[str, Any]:
    reader = get_reader(tuple(DEFAULT_LANGS))
    lines = reader.readtext(image_bytes)
    structured = [
        {
            "text": text,
            "confidence": float(conf) if conf is not None else 0.0,
        }
        for _box, text, conf in lines
    ]
    return {
        "lines": structured,
        "full_text": "\n".join(s["text"] for s in structured if s["text"]),
        "confidence": _aggregate_confidence(lines),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_multipart(image: UploadFile | None = File(default=None)) -> dict[str, Any]:
    if image is None:
        raise HTTPException(status_code=400, detail="Missing image file")
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")
    return _run_ocr(data)


@app.post("/ocr/json")
async def ocr_json(body: OcrBody) -> dict[str, Any]:
    try:
        data = base64.b64decode(body.image_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid base64") from exc
    return _run_ocr(data)
