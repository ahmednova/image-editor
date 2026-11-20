import { createFileRoute } from "@tanstack/react-router";
import { listAllDocuments } from "@/server/documents";
import { HttpError, respond, viewerOf } from "@/server/http";

// Every member's documents, for admins.
export const Route = createFileRoute("/api/admin/documents")({
  server: {
    handlers: {
      GET: ({ request }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          if (!viewer.admin) throw new HttpError(403, "Admins only.");
          return Response.json(await listAllDocuments());
        }),
    },
  },
});
