import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as documents from "@/server/documents";
import { ensureUser } from "@/server/users";
import { documentName } from "@/shared/bundle";

// The pages' calls. Each runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in, and every query takes their id.

const idInput = z.object({ id: z.string().uuid() }).strict();

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await ensureUser(user);
    return {
      documents: await documents.listDocuments(user.id),
      admin: isAdmin(user),
    };
  });

export const getEditorDocument = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(({ data, context }) =>
    documents.getDocument(context.user.id, data.id),
  );

export const renameDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    idInput.extend({ name: documentName }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const doc = await documents.renameDocument(
      context.user.id,
      data.id,
      data.name,
    );
    if (!doc) throw new Error("That document no longer exists.");
    return doc;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const deleted = await documents.deleteDocument(
      { id: user.id, admin: isAdmin(user) },
      data.id,
    );
    if (!deleted) throw new Error("That document no longer exists.");
    return { ok: true };
  });

export const getAllDocuments = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    if (!isAdmin(user)) return { allowed: false as const };
    return { allowed: true as const, documents: await documents.listAllDocuments() };
  });
