import { foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    parentFk: foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "tags_parent_id_tags_id_fk",
    }).onDelete("set null"),
    deletedIdx: index("tags_deleted_idx").on(t.deletedAt),
    parentIdx: index("tags_parent_id_idx").on(t.parentId),
    nameIdx: index("tags_name_idx").on(t.name),
  })
);

