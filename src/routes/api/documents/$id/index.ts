import { createFileRoute } from "@tanstack/react-router";
import {
  deleteDocument,
  getDocument,
  renameDocument,
} from "@/server/documents";
import { notFound, readName, respond, viewerOf, HttpError } from "@/server/http";

export const Route = createFileRoute("/api/documents/$id/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const doc = await getDocument(viewer.id, params.id);
          return doc ? Response.json(doc) : notFound();
        }),
      PATCH: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const body = (await request.json().catch(() => {
            throw new HttpError(400, "Send JSON.");
          })) as { name?: unknown };
          const doc = await renameDocument(
            viewer.id,
            params.id,
            readName(body?.name),
          );
          return doc ? Response.json(doc) : notFound();
        }),
      DELETE: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          return (await deleteDocument(viewer, params.id))
            ? new Response(null, { status: 204 })
            : notFound();
        }),
    },
  },
});
