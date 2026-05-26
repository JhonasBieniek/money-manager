# STT service (faster-whisper)

Serviço HTTP interno para transcrição de áudio. O contêiner baixa o modelo Whisper na primeira execução (pode demorar).

## Desenvolvimento local (sem Docker)

Na raiz do monorepo:

```bash
pnpm dev:stt
```

Na primeira execução o script cria `apps/stt/.venv`, instala `requirements.txt` e sobe o Uvicorn. Lê `STT_*` do `.env` na raiz.

Requer **ffmpeg** no PATH (`brew install ffmpeg` no macOS).

### Modelo

Padrão: `STT_MODEL=small`. Para trocar (ex.: `medium`), altere no `.env` e reinicie o serviço — o faster-whisper baixa o novo peso automaticamente.

### Redução de ruído

`STT_NOISE_REDUCTION=true` aplica `noisereduce` após o decode ffmpeg e antes da transcrição.

## API

- `GET /health` — status ok
- `POST /transcribe` — multipart campo `audio` (OGG, MP3, WAV, etc.)

Resposta inclui `full_text`, `language`, `segments`, `noise_reduction_applied`.

## Testes

```bash
cd apps/stt && .venv/bin/pytest
```
