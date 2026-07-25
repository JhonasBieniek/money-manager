# Dashboard "Cards" fatura total + dashboard geral sem duplicidade de cartão

## Contexto

`/dashboard/cards` (rota do frontend) é a página "Cartões e Faturas"
(`apps/web/src/pages/CreditCardsPage.tsx`), que lista, por cartão, a fatura
do período filtrado (mês/ano) via `GET /v1/credit-cards/statements/current`.
Não existe uma rota de API `/dashboard/cards` — o pedido é sobre essa página.

Hoje o dashboard geral (`GET /v1/dashboard/summary` e `GET /v1/dashboard/history`,
implementados em `apps/api/src/modules/dashboard/dashboard.service.ts`) soma
**todas** as despesas (`expenses.amountCents`) pela data (`occurredAt`) dentro
do mês calendário filtrado — incluindo despesas com `paymentMethod = "credit_card"`
uma a uma. Isso diverge do conceito de fatura (ciclo de faturamento, que pode
não coincidir com o mês calendário) e conta o gasto de cartão de forma
unitária, quando deveria contar apenas o valor agregado da fatura.

O total "correto" de uma fatura já existe em `creditCardStatements`
(`calculatedTotalCents`, recalculado via `recalculateStatementTotal` sempre
que uma despesa é vinculada/alterada) e opcionalmente ajustado manualmente em
`adjustedTotalCents`.

## Objetivo

1. Exibir, na página `/dashboard/cards`, o total acumulado em R$ de todas as
   faturas (de todos os cartões do usuário) no período exibido pelos filtros
   de mês/ano da própria tela.
2. No dashboard geral do projeto (summary + history), parar de somar despesas
   de cartão de crédito de forma unitária no total de gastos. Somente o total
   agregado da fatura deve entrar como "gasto de cartão de crédito". Despesas
   individuais de cartão continuam entrando normalmente em
   `expensesByCategory` (breakdown por categoria) e em filtros por tag —
   isso não muda.

## Fora de escopo

- Não há mudança de schema/banco (a tabela `creditCardStatements` já tem
  `cycleYear`/`cycleMonth`/`calculatedTotalCents`/`adjustedTotalCents`).
- Não há mudança em `expensesByCategory` nem em `goalsUsage` — ambos
  continuam somando despesas de cartão individualmente, pois servem para
  metrificar categorias, não o total de gasto do dashboard.
- Não há mudança na página de despesas, tags ou filtros por tag.
- Não há novo endpoint de API.

## Parte A — Banner de total acumulado de faturas em `/dashboard/cards`

Arquivo: `apps/web/src/pages/CreditCardsPage.tsx`

Os dados já chegam prontos via `items: CreditCardWithCurrentStatement[]`
(uma fatura por cartão, já resolvida pelo período filtrado no state
`month`/`year`). Mudança 100% no frontend, sem chamada de API adicional:

- Calcular `accumulatedTotalCents` = soma, para cada item com
  `currentStatement !== null`, de `adjustedTotalCents ?? calculatedTotalCents`
  (mesma regra de "total efetivo" já usada em `statement-card.tsx:90-91`).
- Renderizar um card de resumo acima da grade de `StatementCard`s (abaixo do
  filtro de mês/ano), mostrando o total formatado em R$ e o rótulo do
  período (reaproveitando `formatFilterPeriodLabel`).
- Se não houver cartões ou nenhum tiver fatura no período, não exibir o
  banner (mantém o estado vazio atual) ou mostrar R$ 0,00 — decisão de
  implementação, sem impacto de design.

## Parte B — Dashboard geral: fatura substitui soma unitária de cartão

Arquivo: `apps/api/src/modules/dashboard/dashboard.service.ts`

### `getDashboardSummary(userId, year, month)`

- A query de `expensesResult` (hoje soma todas as despesas do mês) passa a
  filtrar `paymentMethod <> 'credit_card'` (usar operador `ne` do
  drizzle-orm), i.e. soma só despesas não-cartão por `occurredAt` dentro do
  mês.
- Nova query somando `creditCardStatements` do usuário onde
  `cycleYear = year AND cycleMonth = month`, valor
  `COALESCE(SUM(COALESCE(adjustedTotalCents, calculatedTotalCents)), 0)`.
- `totalExpenses = despesasNãoCartão + totalFaturasDoMês`.
- `expensesByCategory` e `goalsUsage` continuam com as queries atuais
  (sem filtro de `paymentMethod`), sem mudanças.

### `getDashboardHistory(userId, months)`

- Mesmo tratamento, por mês: a query de despesas agrupada por
  ano/mês (`expenseRows`) passa a excluir `paymentMethod = 'credit_card'`.
- Nova query agrupando `creditCardStatements` por `cycleYear`/`cycleMonth`
  dentro do range de meses solicitado (`first`..`last` slot), somando
  `COALESCE(adjustedTotalCents, calculatedTotalCents)`.
- Ao montar cada slot mensal, `expenses = despesasNãoCartãoDoMês + totalFaturasDoMês`
  (merge por chave `year-month`, mesmo padrão de `Map` já usado no código).

### Tipos

Nenhuma mudança em `packages/types` — `DashboardSummary` e
`DashboardHistoryMonth` mantêm exatamente os mesmos campos; só o valor de
`totalExpenses`/`expenses` muda de cálculo.

### Testes

`apps/api/src/modules/dashboard/dashboard.service.test.ts` será atualizado
para refletir as novas queries (mock adicional para a soma de
`creditCardStatements` em ambos os testes de `getDashboardSummary` e
`getDashboardHistory`), incluindo um caso onde uma despesa de cartão e uma
fatura coexistem, comprovando que só a fatura entra no total.

## Efeito colateral esperado (correto)

Despesas de parcelas de dívida vinculadas a cartão (`debts.service.ts`, via
`createExpenseForInstallment` → `assignExpenseToStatement`) já entram no
`calculatedTotalCents` da fatura correspondente — logo, ao excluí-las do
somatório unitário de `expenses` e usar a fatura, não há duplicidade nem
perda desses valores.
