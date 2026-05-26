import * as pg from "./pg/index.js";
import * as sqlite from "./sqlite/index.js";

export type DbProvider = "sqlite" | "supabase";

function readProvider(): DbProvider {
  const raw = process.env.DB_PROVIDER;
  if (raw === "supabase") return "supabase";
  return "sqlite";
}

const provider = readProvider();

// Re-export um conjunto único de tabelas/enums conforme o provider.
// Mantemos os mesmos nomes para que os services permaneçam agnósticos ao dialeto.
// Tipagem: os objetos variam entre pg-core e sqlite-core; os consumers usam junto do `db` correto.
const s: any = provider === "supabase" ? pg : sqlite;

export const paymentMethodValues = s.paymentMethodValues;
export const expenseSourceValues = s.expenseSourceValues;
export const ocrStatusValues = s.ocrStatusValues;

// pg enums existem apenas em supabase, mas os serviços não precisam deles diretamente.
export const paymentMethodEnum = s.paymentMethodEnum;
export const expenseSourceEnum = s.expenseSourceEnum;
export const ocrStatusEnum = s.ocrStatusEnum;

export const expenses = s.expenses;
export const tags = s.tags;
export const expenseTags = s.expenseTags;
export const incomes = s.incomes;
export const incomeTags = s.incomeTags;
export const goals = s.goals;
export const telegramAccounts = s.telegramAccounts;
