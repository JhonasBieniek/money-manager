# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=1200 \
    PIP_RETRIES=25 \
    PIP_PROGRESS_BAR=off \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN rm -f /etc/apt/apt.conf.d/docker-clean \
  && printf 'Binary::apt::APT::Keep-Downloaded-Packages "true";\n' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update -o Acquire::http::Timeout=120 -o Acquire::Retries=6 \
  && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# EasyOCR puxa PyTorch (wheel grande). Baixar torch/torchvision do índice CPU da PyTorch
# reduz pressão em files.pythonhosted.org e evita ReadTimeoutError comum em redes lentas.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel \
 && pip install --prefer-binary --timeout 1200 --retries 25 \
      --index-url https://download.pytorch.org/whl/cpu \
      torch torchvision \
 && pip install --prefer-binary --timeout 1200 --retries 25 \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      -r requirements.txt

COPY src ./src

ENV OCR_HOST=0.0.0.0 \
    OCR_PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.main:app --host ${OCR_HOST} --port ${OCR_PORT}"]
