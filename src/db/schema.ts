import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The members who have used the app, keyed by the Gateway's user id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: integer("created_at").notNull(),
});

// A saved document. Its layers live in R2 under a key made from the owner
// and the id (src/server/documents.ts); `version` guards against stale saves.
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    version: integer("version").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("documents_owner_updated").on(table.ownerId, table.updatedAt)],
);
