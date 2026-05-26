# OCR service (EasyOCR)

Serviço HTTP interno. O contêiner baixa modelos na primeira execução (pode demorar).

- `POST /ocr` — multipart campo `image` (arquivo) ou JSON `{"image_base64": "..."}`.
- Resposta inclui `confidence` agregada (0–1) para o fluxo do bot.
