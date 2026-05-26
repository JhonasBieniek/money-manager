import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "tags_parent_id_tags_id_fk",
    }).onDelete("set null"),
    index("tags_deleted_idx").on(t.deletedAt),
    index("tags_parent_id_idx").on(t.parentId),
    index("tags_name_idx").on(t.name),
  ]
);

