import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// An in-memory SQLite with the app's migrations stands in for D1, and a Map
// for the R2 bucket.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
const bucket = vi.hoisted(() => new Map<string, string>());
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    files: {
      put: async (key: string, value: string | ArrayBuffer) => void bucket.set(key, String(value)),
      get: async (key: string) => (bucket.has(key) ? { body: bucket.get(key) } : null),
      delete: async (keys: string | string[]) => [keys].flat().forEach((key) => bucket.delete(key)),
      list: async ({ prefix }: { prefix: string }) => ({
        objects: [...bucket.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      }),
    },
  },
}));

const documents = await import("./documents");
const { ensureUser } = await import("./users");

const upload = (width = 10) => ({
  bundle: { format: 1 as const, width, height: 5, layers: [] },
  text: `{"w":${width}}`,
  thumbnail: new ArrayBuffer(8),
});

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  testDb.current = db;
  await ensureUser({ id: "alice", email: "alice@example.com" });
  await ensureUser({ id: "bob", email: "bob@example.com" });
});

describe("documents", () => {
  it("belong to their owner; an admin may delete any", async () => {
    const mine = await documents.createDocument("alice", "Poster", upload());
    await documents.createDocument("bob", "Card", upload());
    expect((await documents.listDocuments("alice")).map((d) => d.name)).toEqual(["Poster"]);
    expect(await documents.getDocument("bob", mine.id)).toBeNull();
    expect(await documents.readDocumentData("bob", mine.id)).toBeNull();
    expect(await documents.renameDocument("bob", mine.id, "Taken")).toBeNull();
    expect(await documents.deleteDocument({ id: "bob", admin: false }, mine.id)).toBe(false);
    expect(await documents.readThumbnail({ id: "bob", admin: true }, mine.id)).not.toBeNull();
    expect(await documents.deleteDocument({ id: "bob", admin: true }, mine.id)).toBe(true);
    expect([...bucket.keys()].some((key) => key.includes(mine.id))).toBe(false);
  });

  it("refuse a save from a stale version and keep one copy of the data", async () => {
    const doc = await documents.createDocument("alice", "Banner", upload());
    const saved = await documents.saveDocument("alice", doc.id, 1, upload(20));
    expect(saved).toMatchObject({ status: "saved", doc: { version: 2, width: 20 } });
    expect(await documents.saveDocument("alice", doc.id, 1, upload(30))).toEqual({ status: "stale", version: 2 });
    expect(await documents.saveDocument("bob", doc.id, 2, upload(30))).toEqual({ status: "missing" });
    expect([...bucket.keys()].filter((key) => key.includes(`${doc.id}/v`))).toEqual([`documents/alice/${doc.id}/v2.json`]);
  });
});
