import { createFileRoute } from "@tanstack/react-router";
import { readDocumentData, saveDocument } from "@/server/documents";
import {
  HttpError,
  notFound,
  readForm,
  readUpload,
  respond,
  viewerOf,
} from "@/server/http";

// The document's layers. PUT saves over the version the editor opened and
// answers 409 when a newer save is already stored.
export const Route = createFileRoute("/api/documents/$id/data")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const found = await readDocumentData(viewer.id, params.id);
          if (!found) return notFound();
          return new Response(found.object.body, {
            headers: {
              "content-type": "application/json",
              "cache-control": "private, no-store",
              "x-document-version": String(found.doc.version),
            },
          });
        }),
      PUT: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const form = await readForm(request);
          const version = Number(form.get("version"));
          if (!Number.isInteger(version) || version < 1)
            throw new HttpError(400, "Say which version this save is from.");
          const upload = await readUpload(form);
          const result = await saveDocument(viewer.id, params.id, version, upload);
          if (result.status === "missing") return notFound();
          if (result.status === "stale")
            return Response.json(
              {
                error: "A newer copy was saved since you opened this one. Reopen the document to get it.",
                version: result.version,
              },
              { status: 409 },
            );
          return Response.json(result.doc);
        }),
    },
  },
});
