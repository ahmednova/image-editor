import { createFileRoute } from "@tanstack/react-router";
import { readThumbnail } from "@/server/documents";
import { notFound, respond, viewerOf } from "@/server/http";

export const Route = createFileRoute("/api/documents/$id/thumbnail")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        respond(async () => {
          const viewer = await viewerOf(request);
          const object = await readThumbnail(viewer, params.id);
          if (!object) return notFound();
          return new Response(object.body, {
            headers: {
              "content-type": "image/png",
              "cache-control": "private, no-cache",
              "x-content-type-options": "nosniff",
            },
          });
        }),
    },
  },
});
