import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pricingSourceEnum } from "./investments.js";
import { users } from "./users.js";

export const userProviderCredentials = pgTable(
  "user_provider_credentials",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: pricingSourceEnum("provider").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);
