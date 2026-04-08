# Money Manager

- A ideia aqui é criar um sistema completo, com segurança, sem race condition e totalmente pronto para escalar. O sistema inicialmente será focado na inserção/armazenamento/leitura e edição de despesas, podendo ser essas despesas inseridas manualmente via website ou a partir de um bot próprio no Telegram, que irá receber um print de uma notificação de compra no cartão de crédito com uma mensagem descrevendo aquela compra como uma categoria ou uma descrição mesmo e então armazenar os dados daquela compra em um banco de dados para que aquela informação seja recuperada e utilizada no sistema posteriormente.

- Esse projeto será de portfolio no meu GitHub e que eu possa utilizá-lo internamente (não teremos usuários além de eu mesmo, mas é interessante que o sistema seja 100% completo para fins de estudo).

### Stack definida

Backend: Node.js + TypeScript + Fastify

Fastify tem schema validation nativo (via JSON Schema + Zod adapter), performance superior ao Express, e plugin ecosystem maduro. Ideal para APIs que precisam de contratos bem definidos.

Frontend: Next.js 14+ (App Router) + TypeScript + TailwindCSS + shadcn/ui (componentes UI serão adicionados via CLI; a pasta `components/ui/` está reservada)

Server Components para leitura de dados, Client Components apenas onde necessário. Elimina a necessidade de um BFF separado.

Banco de dados: PostgreSQL

ACID, transações serializáveis, row-level locking — tudo que precisamos para eliminar race conditions. Nada de NoSQL aqui: dados financeiros exigem consistência forte.

ORM: Drizzle ORM

Type-safe no nível do SQL, sem overhead de abstração desnecessária, migrations versionadas (geradas após DDL final acordado). Melhor que Prisma para quem quer controle real das queries.

Bot do Telegram: Grammy (Node.js)

Roda como um serviço separado no mesmo monorepo. Em produção usa **webhooks** (HTTPS) — na VPS com Coolify o processo permanece estável e sem cold start da free tier.

OCR / visão: microserviço **Python (FastAPI) + EasyOCR** (`apps/ocr`)

O bot envia a imagem ao serviço OCR, recebe texto e **score de confiança** agregado (0–1), alinhado à regra em `docs/AI-RULES.md` (> 0,80 salva automaticamente). Parsing por banco fica em `apps/bot` (`parser.service.ts`).

Autenticação: JWT com access token curto (15min) + refresh token rotativo (7 dias) armazenado em cookie HttpOnly. Sem biblioteca externa de auth — implementação própria para fins de estudo.

Monorepo: Turborepo + pnpm

Apps: `apps/web`, `apps/api`, `apps/bot`, `apps/ocr`. Packages: `packages/db`, `packages/types`, `packages/utils`.

### Infraestrutura (Coolify / VPS Hostinger)

Deploy alvo: **Coolify** em **VPS KVM2 (Hostinger)**.

HTTPS termina no proxy reverso do stack (Traefik via Coolify). Serviços expostos publicamente: `web`, `api`, `bot` (webhook). Serviços apenas na rede interna: **PostgreSQL**, **OCR**. Variáveis sensíveis configuradas no Coolify; uso local documentado em `.env.example`.

Pool de conexões: driver `pg` com pool na API; **PgBouncer é opcional** na mesma VPS se quiser limitar conexões ao Postgres — não há dependência de PaaS.

**Migrations no deploy:** a imagem da API (`apps/api/Dockerfile`) usa `docker-entrypoint.sh`, que executa `pnpm --filter @money-manager/db run db:migrate:runtime` (script `packages/db/scripts/run-migrations.mjs`, Drizzle migrator) quando `DATABASE_URL` está definida e `RUN_DB_MIGRATIONS` não é `false`. O script confere se `public.users` existe após o migrate e falha com mensagem explícita se o Drizzle tiver registrado migração em `drizzle.__drizzle_migrations` mas o DDL não tiver rodado (ex.: volume reutilizado, reset só do schema `public` ou URL de banco diferente da que você inspeciona). Nesse caso: alinhar `DATABASE_URL` ou `DROP SCHEMA drizzle CASCADE` num banco descartável e redeploy. `RUN_DB_MIGRATIONS=false` evita corrida se você escalar a API para várias instâncias — nesse caso rode migrations uma vez por deploy (comando único no Coolify ou job) apontando o mesmo `DATABASE_URL`.

### Fundamentos de segurança

HTTPS via proxy (Coolify)

Rate limiting por IP no Fastify (`@fastify/rate-limit`)

Validação de payload com Zod em todas as rotas

Webhook secret do Telegram validado em cada requisição (quando implementado no pipeline do bot)

Cabeçalhos HTTP seguros via `@fastify/helmet`

Variáveis de ambiente nunca no repositório — `.env` no `.gitignore`, documentado via `.env.example`

Refresh token com rotação: ao usar, o antigo é invalidado e um novo é emitido

### Fundamentos anti race condition

Todas as operações de escrita no banco ocorrem dentro de transações explícitas

Para operações que dependem de leitura antes de escrita (ex.: somar saldo), usar `SELECT ... FOR UPDATE` para bloquear a linha

Idempotency key nas requisições do bot: cada update do Telegram tem um `update_id` único — usar como chave de idempotência para evitar inserção duplicada caso o webhook seja entregue mais de uma vez

Isolamento de transação no nível READ COMMITTED (padrão do Postgres) é suficiente para o caso de uso, com SERIALIZABLE disponível para operações críticas futuras

### Fundamentos de escalabilidade

API stateless — nenhum estado em memória, tudo no banco. Permite múltiplas instâncias sem coordenação

Connection pooling via `pg` (e PgBouncer opcional na VPS)

Arquitetura de serviços separados (API, Bot, Web, OCR) permite escalar independentemente

Schema do banco modelado com índices desde o início (por `user_id`, data, categoria) — a definir nas migrations após o DDL final

### Desenvolvimento local

- `pnpm install` (no projeto: `npx pnpm@9 install` se o pnpm global não estiver disponível)

- `docker compose up` sobe Postgres, OCR, API, Web e Bot — ver `docker-compose.yml`

- Migrations Drizzle: gerar após receber a estrutura final do banco (`packages/db`)
