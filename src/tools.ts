// The app's tools for AI clients, served by the Gateway at /mcp.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import * as documents from "@/server/documents";

export const tools = defineTools({
  list_documents: {
    description:
      "List the user's saved image documents, newest first, with their size in pixels.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => documents.listDocuments(user.id),
  },
});
