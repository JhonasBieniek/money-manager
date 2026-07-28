import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const investmentAccountTypeEnum = pgEnum("investment_account_type", [
  "brokerage",
  "crypto",
  "fixed_income",
  "pension",
  "real_estate",
  "cash",
  "other",
]);

export const assetClassEnum = pgEnum("asset_class", [
  "stocks",
  "fii",
  "fixed_income",
  "crypto",
  "fund",
  "real_estate",
  "cash",
  "other",
]);

export const incomeTypeEnum = pgEnum("income_type", [
  "fixed_income",
  "variable_income",
]);

export const pricingSourceEnum = pgEnum("pricing_source", [
  "manual",
  "brapi",
  "coingecko",
  "yahoo",
  "alpha_vantage",
]);

export const investmentAccounts = pgTable(
  "investment_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: investmentAccountTypeEnum("type").notNull(),
    institution: text("institution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("investment_accounts_user_id_idx").on(t.userId)],
);

export const investmentHoldings = pgTable(
  "investment_holdings",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => investmentAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    incomeType: incomeTypeEnum("income_type").notNull().default("fixed_income"),
    assetClass: assetClassEnum("asset_class"),
    quantity: numeric("quantity", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),
    averageCostCents: bigint("average_cost_cents", { mode: "number" }),
    currentUnitValueCents: bigint("current_unit_value_cents", {
      mode: "number",
    }).notNull(),
    maturityDate: date("maturity_date"),
    pricingSource: pricingSourceEnum("pricing_source")
      .notNull()
      .default("manual"),
    manualOverride: boolean("manual_override").notNull().default(false),
    lastValuationAt: timestamp("last_valuation_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastQuoteError: text("last_quote_error"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("investment_holdings_account_id_idx").on(t.accountId),
    index("investment_holdings_user_id_idx").on(t.userId),
  ],
);
