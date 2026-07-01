# Deploy — Money Manager (VPS multi-projeto)



Este projeto **não** sobe Caddy nem Postgres. Usa serviços compartilhados em `/opt/postgres` e `/opt/caddy`.



## Arquitetura



```

GitHub Actions CI  →  lint, test, build (código)

GitHub Actions CD  →  build imagens ARM64 → GHCR → pull na VPS

                              ↓

Internet :443 → /opt/caddy (caddy)

                    ↓ rede "portfolio"

              mm.seudominio.com → mm-web, mm-api, mm-bot

                    ↓

              /opt/postgres (postgres)

                    └── database money_manager (user mm_app)



mm-bot → mm-stt (Whisper local, rede internal apenas)

```



## Pipeline de CD



| Job | Onde roda | O que faz |

|-----|-----------|-----------|

| **CI** | GitHub | lint, test, build TypeScript |

| **build-and-push** | GitHub (QEMU ARM64) | Build Docker → `ghcr.io/<owner>/money-manager-*:<sha>` |

| **deploy** | VPS via SSH | `pull` + `up -d --wait` + health check |



\* STT demora mais **só no primeiro build** ou quando `apps/stt/` muda — cache GHA reutiliza layers (modelo Whisper ~500 MB fica na imagem, não baixa a cada deploy na VPS).



### STT — como funciona



- Roda em **container dedicado** (`mm-stt`) — padrão sidecar/microserviço.

- Modelo Whisper é **embutido na imagem** no build (`apps/stt/Dockerfile`), não baixado em runtime.

- **Antes:** `docker compose build` na VPS reconstruía tudo (lento) a cada deploy.

- **Agora:** build no GitHub Actions com cache; VPS só faz `docker pull` (rápido).


## Containers deste projeto



| container_name | Rede portfolio | Papel |

|----------------|----------------|-------|

| `mm-api` | sim | API Express |

| `mm-web` | sim | SPA (nginx) |

| `mm-bot` | sim | Webhook Telegram |

| `mm-stt` | não (só internal) | Whisper local |



## Rotas (Caddy central em `/opt/caddy`)



| URL | Backend |

|-----|---------|

| `https://DOMAIN/` | `mm-web:80` |

| `https://DOMAIN/v1/*` | `mm-api:3001` |

| `https://DOMAIN/health` | `mm-api:3001` |

| `https://DOMAIN/telegram` | `mm-bot:3002` |

