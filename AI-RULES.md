# Essas regras são imutáveis. Qualquer funcionalidade nova deve respeitá-las.

- Nunca acessar banco direto no controller
- Toda lógica vai no service
- Sempre criar teste antes de implementar
- Código deve ser simples e legível
- Sempre questione a segurança da implementação
- O projeto como um todo deve conter uma estrutura atômica

### Produto

App **single-user** (local/pessoal): sem login, JWT ou `user_id`. Web → API sem auth de usuário.

Monorepo: `apps/api` (Fastify), `apps/web` (Next.js), `apps/bot` (opcional), `packages/db`, `packages/types`, `packages/utils`.

Banco: `DB_PROVIDER=sqlite` (`SQLITE_PATH`) ou `supabase` (`DATABASE_URL`). Setup: `pnpm setup` + `db:migrate:runtime` (sem seed de dados).

### Domínio

**Tags** — etiquetas livres, várias por despesa/receita; sub-tags com `parentId` (um nível). API: `tagIds?`.

**Categorias de meta** — enum em `packages/types` (`GOAL_CATEGORIES` / `GOAL_CATEGORY_LABELS`): liberdade financeira, custos fixos, conforto, metas, prazeres, conhecimento.

- Toda **despesa** exige `goalCategory` (plano financeiro).
- **Receitas** não têm `goalCategory`; só tags.
- **Metas** (`goals`): percentuais somam **100%**; `spent` no dashboard = despesas do mês agrupadas por `goalCategory`.

Não usar tabela/módulo de **categorias** separado de tags.

### Arquitetura

Route → Controller → Service → DB (Drizzle). Controller só valida (Zod) e delega.

Services: regra de negócio; retornar tipos de `packages/types`; filtrar `deleted_at IS NULL` nas queries.

Escritas em transação explícita. SQL case-insensitive: `ciLike` / `ciEqual` (`shared/db/sql-helpers.ts`). Leitura+escrita com corrida: `SELECT ... FOR UPDATE`.

### Dados

- **Dinheiro:** centavos (`INTEGER`); conversão nas bordas; `packages/utils/money.ts`.
- **`occurred_at`:** data de calendário da transação (≠ `created_at`). Usar `packages/utils/date.ts` — não `new Date("YYYY-MM-DD")` nem `toISOString().split("T")[0]` nos forms.
- **Soft delete:** `deleted_at`; exclusão só via API (update), nunca hard delete.
- **IDs:** UUID v7 em `packages/utils/id.ts`, gerado no service antes do insert.

### API

Zod por módulo. DELETE → `204` sem body. Erros: `AppError`; mensagem genérica ao cliente, detalhe no log.

### Web

- `apiFetch`: `Content-Type: application/json` **somente com body**.
- Despesas/receitas: cadastro e edição em **modal** (`TransactionModalsProvider`); CTA no header por rota.
- Tags: `SearchableMultiSelect`; despesas: `SearchableSelect` para `goalCategory`.
- Metas: slider na própria barra de progresso; teto dinâmico por categoria (soma = 100%); classes Tailwind **estáticas** por cor.
- Exclusão: só remover da UI se `res.ok`.
- Feature com impacto no produto → incluir UI na web, salvo pedido em contrário.

### Bot

Só via API interna (`INTERNAL_API_KEY`). `idempotency_key` em despesas (Telegram). OCR: confiança ≥ 0,80 salva direto; abaixo, confirma.

### Segurança

Uso local sem auth na web. Validar entrada (Zod); proteger rotas internas do bot; não expor segredos.

### Convenções

kebab-case (arquivos), camelCase (funções), PascalCase (tipos), snake_case (banco), SCREAMING_SNAKE_CASE (env).

**Este documento é o contrato do projeto. Qualquer PR que viole uma dessas regras está errado independente de funcionar.**
