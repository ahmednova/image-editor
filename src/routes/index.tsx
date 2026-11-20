import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FilePlus, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { ACCEPT, blankDoc } from "@/client/editor/io";
import { DocumentCard, type CardDocument } from "@/client/library/DocumentCard";
import { LibraryNav } from "@/client/library/LibraryNav";
import { NameDialog } from "@/client/library/NameDialog";
import { NewDocumentDialog } from "@/client/library/NewDocumentDialog";
import { useNewDocument } from "@/client/library/useOpenImage";
import { deleteDocument, getLibrary, renameDocument } from "@/serverFunctions/documents";

export const Route = createFileRoute("/")({
  loader: () => getLibrary(),
  head: () => ({ meta: [{ title: "Documents · Image Editor" }] }),
  component: Library,
});

function Library() {
  const { documents, admin } = Route.useLoaderData();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, open, create } = useNewDocument();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<CardDocument | null>(null);
  const [deleting, setDeleting] = useState<CardDocument | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // Pasting an image opens it as a new document.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])][0];
      if (file) {
        event.preventDefault();
        void open(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await deleteDocument({ data: { id: deleting.id } });
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't delete it.");
    } finally {
      setDeletePending(false);
    }
  }

  const actions = (
    <>
      <Button variant="outline" onClick={() => input.current?.click()} pending={busy} data-testid="open-image">
        <FolderOpen /> Open image
      </Button>
      <Button onClick={() => setCreating(true)} data-testid="new-document">
        <FilePlus /> New document
      </Button>
    </>
  );

  return (
    <AppShell nav={<LibraryNav admin={admin} current="mine" />}>
      <div
        className="space-y-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = event.dataTransfer.files[0];
          if (file) {
            event.preventDefault();
            void open(file);
          }
        }}
      >
        <PageHeader title="Documents" actions={actions} />
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="open-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void open(file);
          }}
        />
        {error ? (
          <Alert variant="destructive" data-testid="open-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {documents.length === 0 ? (
          <div data-testid="library-empty">
            <EmptyState
              title="No documents yet"
              description="Create a blank document, or open, drop or paste an image here."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onRename={() => setRenaming(doc)} onDelete={() => setDeleting(doc)} />
            ))}
          </div>
        )}
      </div>

      <NewDocumentDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (spec) => {
          await create(spec.name, blankDoc(spec.width, spec.height, spec.background));
          setCreating(false);
        }}
      />
      <NameDialog
        title="Rename document"
        initial={renaming?.name ?? ""}
        open={renaming !== null}
        onOpenChange={(next) => !next && setRenaming(null)}
        testId="document-name"
        onSave={async (name) => {
          await renameDocument({ data: { id: renaming!.id, name } });
          await router.invalidate();
        }}
      />
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          pending={deletePending}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        >
          Its layers can’t be recovered.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
