# Money Manager

Plataforma de **finanças pessoais** em nível portfólio: autenticação multi-usuário, metas por categoria, tags hierárquicas e **bot Telegram por voz** que transforma áudio em despesas — pensada para demonstrar engenharia full-stack com critérios de produção.

## Visão da arquitetura

```
┌─────────────┐     JWT (sessionStorage)   ┌──────────────────────────────────────────┐
│  SPA Vite   │◄──────────────────────────►│  API Express 5                           │
│  React 19   │     cookie refresh (HttpOnly)│  Drizzle ORM · PostgreSQL 16           │
│  Tailwind 4 │     CSRF (x-xsrf-token)    │  Zod · helmet · rate-limit              │
└──────┬──────┘                             └───────────────┬──────────────────────────┘
       │                                                    │
       │                                                    │ chave API interna
       │                                         ┌──────────▼──────────┐
       │                                         │  Bot Telegram Grammy │
       │                                         │  polling (dev) /       │
       │                                         │  webhook (prod)        │
       │                                         └──────────┬──────────┘
       │                                                    │ HTTP
       │                                         ┌──────────▼──────────┐
       │                                         │  apps/stt (Python)   │
       │                                         │  faster-whisper local │
       │                                         │  modelo na imagem Docker │
       └─────────────────────────────────────────┴──────────────────────┘

```

**Princípios de design**

- **Valores em centavos** — inteiros no banco; sem aritmética em ponto flutuante.
- **Isolamento por usuário** — `user_id` em todas as entidades; JWT nas rotas de negócio.
- **Fronteira do bot** — o bot não acessa o banco; usa HTTP interno com segredo compartilhado.
- **STT local** — Whisper em serviço Python dedicado; modelo embutido no build da imagem (sem download em runtime).
- **Soft delete** — despesas e receitas com `deleted_at` para auditoria.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Vite 6, React 19, React Router 7, Tailwind CSS 4, Framer Motion |
| API | Express 5, Zod 3, jose (JWT), bcrypt, helmet, express-rate-limit |
| Banco | PostgreSQL 16 + Drizzle ORM (migrations SQL) |
| Compartilhado | `@money-manager/types`, `@money-manager/utils` |
| Bot | Grammy — polling no dev, webhook em produção |
| STT | Python 3.12, FastAPI, faster-whisper |
| Testes | Jest + ts-jest (~138 testes), integração com Postgres real no CI |
| E2E | Playwright (Chromium) — cadastro, login, despesa, dashboard |
| CI / segurança | GitHub Actions, CodeQL |

## Destaques técnicos

### Modelo de domínio

| Conceito | Comportamento |
|----------|---------------|
| **Metas** | Seis categorias (`goal_category`) com sliders de percentual; uso calculado pelas despesas |
| **Tags** | Hierarquia pai/filho; vínculo N:N com despesas e receitas |
| **Despesas** | `goalCategory` obrigatório na UI; despesas do bot podem começar sem categoria |
| **Receitas** | Fonte (salário, freelance, etc.) + tags opcionais |
| **Dashboard** | Resumo mensal + histórico rolante (3M / 6M / 1A) |
| **Vínculo Telegram** | Token temporário por usuário (`/start <token>`) |

### Autenticação e segurança

- **Sessão** — JWT de curta duração no `sessionStorage`; refresh em cookie `HttpOnly` com rotação.
- **CSRF** — cookie `_csrf` + header `x-xsrf-token` em mutações.
- **Senhas** — bcrypt; mensagens genéricas no login.
- **API interna** — `x-internal-api-key` para o bot criar despesas e vincular contas.
- **HTTP** — helmet, CORS restrito, rate limit global.

### Pipeline de voz (Telegram)

1. Usuário envia áudio (conta vinculada).
2. Bot baixa o arquivo do Telegram (retry + timeout).
3. `POST /transcribe` no `apps/stt` (Whisper local, idioma padrão PT).
4. Parser extrai valor e descrição.
5. `POST /v1/internal/expenses` com idempotência; `source: telegram_whisper`, pagamento **PIX**.
6. Web: sininho no header lista pendentes; usuário atribui categoria e tags.

### UX do frontend

- **Modais de transação** — criar/editar sem sair das listas.
- **Filtros** — mês/ano, descrição, tags; total filtrado na API.
- **Dashboard** — filtro mensal nos cards e metas; gráfico com seletor 3M/6M/1A separado.
- **Telegram** — card de vínculo atualiza automaticamente após gerar o código.

## Estrutura do projeto

```
money-manager-v3/
├── apps/api, web, bot, stt
├── packages/db, types, utils
├── docker-compose.yml
└── .github/workflows/
```

## Início rápido

**Requisitos:** Node.js 22+, pnpm 10+, Docker + Compose (recomendado).

```bash
cp .env.example .env
# Obrigatório: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# Opcional: TELEGRAM_BOT_TOKEN
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:3001 |
| PostgreSQL (host) | localhost:15432 |

**Sem Docker completo** (API + web no host):

```bash
docker compose up -d postgres
pnpm install
pnpm --filter @money-manager/db run db:migrate:runtime
pnpm dev
```

## Visão da API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/v1/auth/register` · `/login` | Cadastro / login |
| POST | `/v1/auth/refresh` · `/logout` | Renovar / encerrar sessão |
| GET · POST | `/v1/expenses` | Listar / criar despesa |
| GET | `/v1/expenses/uncategorized` | Despesas do bot sem categoria |
| PATCH | `/v1/expenses/:id/categorize` | Atribuir categoria |
| GET · POST | `/v1/incomes` | Receitas |
| GET | `/v1/dashboard/summary` | Resumo mensal (`?year=&month=`) |
| GET | `/v1/dashboard/history` | Histórico (`?period=3\|6\|12`) |
| POST | `/v1/telegram/link-token` | Gerar código de vínculo |

Rotas internas exigem `x-internal-api-key`. Demais rotas de negócio exigem `Authorization: Bearer`.

## Qualidade

```bash
pnpm lint && pnpm build && pnpm test
pnpm test:e2e      # Playwright — API + web sobem automaticamente (precisa de Postgres)
```

**E2E local:** suba o Postgres (`docker compose up -d postgres`), instale o Chromium uma vez (`pnpm exec playwright install chromium`) e rode `pnpm test:e2e`. Detalhes em [e2e/README.md](./e2e/README.md).

CI: lint, build, migrate, Jest com PostgreSQL 16 e job **e2e** (Playwright com API + Vite + Postgres). Falhas no E2E geram relatório HTML e traces. CodeQL no TypeScript.

## Licença

Este projeto está sob a licença MIT — veja [LICENSE](./LICENSE).

---

Read in English: [README.md](./README.md)
