import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { baseName, OpenError, openFile, uploadNewDocument } from "@/client/editor/io";
import type { Doc } from "@/client/editor/model";

/** Opens a file (or creates a blank document) as a new saved document, then the editor. */
export function useNewDocument() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (name: string, doc: Doc) => {
      const { id } = await uploadNewDocument(name, doc);
      await navigate({ to: "/documents/$id", params: { id } });
    },
    [navigate],
  );

  const open = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        await create(baseName(file.name), await openFile(file));
      } catch (cause) {
        setError(
          cause instanceof OpenError || cause instanceof Error
            ? cause.message
            : "That file couldn't be opened.",
        );
      } finally {
        setBusy(false);
      }
    },
    [create],
  );

  return { busy, error, open, create };
}
