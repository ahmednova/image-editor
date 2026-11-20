import { createFileRoute } from "@tanstack/react-router";
import { createDocument, listDocuments } from "@/server/documents";
import { readForm, readName, readUpload, respond, viewerOf } from "@/server/http";

// The member's documents. POST takes a form: name, data (the layers as
// JSON, src/shared/bundle.ts) and thumbnail (a PNG).
export const Route = createFileRoute("/api/documents/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          return Response.json(await listDocuments(viewer.id));
        }),
      POST: ({ request }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const form = await readForm(request);
          const name = readName(form.get("name"));
          const upload = await readUpload(form);
          const doc = await createDocument(viewer.id, name, upload);
          return Response.json(doc, { status: 201 });
        }),
    },
  },
});
