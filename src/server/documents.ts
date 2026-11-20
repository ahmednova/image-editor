import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { documents, users } from "@/db/schema";
import type { DocumentBundle } from "@/shared/bundle";

// Documents belong to the member who made them. Every query takes the
// viewer's id; only deleteDocument and thumbnails also admit an admin.
// R2 keys come from the owner and the id, never from the request.

export interface DocumentSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  version: number;
  updatedAt: number;
}

export interface Viewer {
  id: string;
  admin: boolean;
}

const shown = {
  id: documents.id,
  name: documents.name,
  width: documents.width,
  height: documents.height,
  version: documents.version,
  updatedAt: documents.updatedAt,
};

const prefix = (ownerId: string, id: string) => `documents/${ownerId}/${id}/`;
const dataKey = (ownerId: string, id: string, version: number) =>
  `${prefix(ownerId, id)}v${version}.json`;
const thumbnailKey = (ownerId: string, id: string) =>
  `${prefix(ownerId, id)}thumbnail.png`;

export function listDocuments(ownerId: string): Promise<DocumentSummary[]> {
  return db
    .select(shown)
    .from(documents)
    .where(eq(documents.ownerId, ownerId))
    .orderBy(desc(documents.updatedAt), desc(documents.id));
}

export function listAllDocuments(): Promise<
  (DocumentSummary & { ownerEmail: string })[]
> {
  return db
    .select({ ...shown, ownerEmail: users.email })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.ownerId))
    .orderBy(desc(documents.updatedAt), desc(documents.id));
}

export async function getDocument(
  ownerId: string,
  id: string,
): Promise<DocumentSummary | null> {
  const [doc] = await db
    .select(shown)
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)));
  return doc ?? null;
}

export interface Upload {
  bundle: DocumentBundle;
  /** The bundle as received, stored as is. */
  text: string;
  thumbnail: ArrayBuffer;
}

export async function createDocument(
  ownerId: string,
  name: string,
  upload: Upload,
): Promise<DocumentSummary> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.files.put(dataKey(ownerId, id, 1), upload.text, {
    httpMetadata: { contentType: "application/json" },
  });
  await env.files.put(thumbnailKey(ownerId, id), upload.thumbnail, {
    httpMetadata: { contentType: "image/png" },
  });
  const [doc] = await db
    .insert(documents)
    .values({
      id,
      ownerId,
      name,
      width: upload.bundle.width,
      height: upload.bundle.height,
      version: 1,
      bytes: upload.text.length,
      createdAt: now,
      updatedAt: now,
    })
    .returning(shown);
  return doc!;
}

/** The stored layers of the viewer's own document, or null. */
export async function readDocumentData(ownerId: string, id: string) {
  const doc = await getDocument(ownerId, id);
  if (!doc) return null;
  const object = await env.files.get(dataKey(ownerId, id, doc.version));
  return object ? { doc, object } : null;
}

export type SaveResult =
  | { status: "saved"; doc: DocumentSummary }
  | { status: "missing" }
  | { status: "stale"; version: number };

/** Saves over `baseVersion`; refuses when the stored copy is newer. */
export async function saveDocument(
  ownerId: string,
  id: string,
  baseVersion: number,
  upload: Upload,
): Promise<SaveResult> {
  const doc = await getDocument(ownerId, id);
  if (!doc) return { status: "missing" };
  if (doc.version !== baseVersion)
    return { status: "stale", version: doc.version };
  const next = baseVersion + 1;
  await env.files.put(dataKey(ownerId, id, next), upload.text, {
    httpMetadata: { contentType: "application/json" },
  });
  const [updated] = await db
    .update(documents)
    .set({
      version: next,
      width: upload.bundle.width,
      height: upload.bundle.height,
      bytes: upload.text.length,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(documents.id, id),
        eq(documents.ownerId, ownerId),
        eq(documents.version, baseVersion),
      ),
    )
    .returning(shown);
  if (!updated) {
    // Another save won the race; its data stays.
    await env.files.delete(dataKey(ownerId, id, next));
    const current = await getDocument(ownerId, id);
    return current
      ? { status: "stale", version: current.version }
      : { status: "missing" };
  }
  await env.files.delete(dataKey(ownerId, id, baseVersion));
  await env.files.put(thumbnailKey(ownerId, id), upload.thumbnail, {
    httpMetadata: { contentType: "image/png" },
  });
  return { status: "saved", doc: updated };
}

export async function renameDocument(
  ownerId: string,
  id: string,
  name: string,
): Promise<DocumentSummary | null> {
  const [doc] = await db
    .update(documents)
    .set({ name, updatedAt: Date.now() })
    .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
    .returning(shown);
  return doc ?? null;
}

/** The owner, or an admin, deletes the row and every stored object. */
export async function deleteDocument(viewer: Viewer, id: string) {
  const [row] = await db
    .select({ ownerId: documents.ownerId })
    .from(documents)
    .where(
      viewer.admin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.ownerId, viewer.id)),
    );
  if (!row) return false;
  await db.delete(documents).where(eq(documents.id, id));
  let cursor: string | undefined;
  do {
    const page = await env.files.list({
      prefix: prefix(row.ownerId, id),
      cursor,
    });
    if (page.objects.length)
      await env.files.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return true;
}

/** The owner's, or for an admin anyone's, thumbnail. */
export async function readThumbnail(viewer: Viewer, id: string) {
  const [row] = await db
    .select({ ownerId: documents.ownerId })
    .from(documents)
    .where(
      viewer.admin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.ownerId, viewer.id)),
    );
  if (!row) return null;
  return env.files.get(thumbnailKey(row.ownerId, id));
}
