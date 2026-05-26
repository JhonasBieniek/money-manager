# OCR service (EasyOCR)

Serviço HTTP interno. O contêiner baixa modelos na primeira execução (pode demorar).

## Desenvolvimento local (sem Docker)

Na raiz do monorepo:

```bash
pnpm dev:ocr
```

Na primeira execução o script cria `apps/ocr/.venv`, instala `requirements.txt` (inclui PyTorch CPU) e sobe o Uvicorn. Lê `OCR_*` do `.env` na raiz.

Se a instalação falhar com Python 3.14+, use Python 3.11–3.13:

```bash
brew install python@3.12
# no .env:
# OCR_PYTHON=python3.12
```

- `POST /ocr` — multipart campo `image` (arquivo) ou JSON `{"image_base64": "..."}`.
- Resposta inclui `confidence` agregada (0–1) para o fluxo do bot.
