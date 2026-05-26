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
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel \
 && pip install --prefer-binary --timeout 1200 --retries 25 -r requirements.txt

COPY src ./src

ENV STT_HOST=0.0.0.0 \
    STT_PORT=8001 \
    STT_MODEL=small \
    STT_LANGUAGE=pt \
    STT_DEVICE=cpu \
    STT_COMPUTE_TYPE=int8 \
    STT_NOISE_REDUCTION=false

EXPOSE 8001

CMD ["sh", "-c", "uvicorn src.main:app --host ${STT_HOST} --port ${STT_PORT}"]
