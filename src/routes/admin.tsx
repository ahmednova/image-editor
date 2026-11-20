import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { DocumentThumbnail, formatTime } from "@/client/library/DocumentCard";
import { deleteDocument, getAllDocuments } from "@/serverFunctions/documents";
import { LibraryNav } from "@/client/library/LibraryNav";

export const Route = createFileRoute("/admin")({
  loader: () => getAllDocuments(),
  head: () => ({ meta: [{ title: "All documents · Image Editor" }] }),
  component: AllDocuments,
});

function AllDocuments() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (!data.allowed)
    return (
      <AppShell>
        <PageHeader title="All documents" />
        <div data-testid="admin-refused">
          <EmptyState kind="error" title="Only admins can see everyone’s documents" />
        </div>
      </AppShell>
    );

  async function confirmDelete() {
    if (!deleting) return;
    setPending(true);
    try {
      await deleteDocument({ data: { id: deleting.id } });
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't delete it.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell nav={<LibraryNav admin current="all" />}>
      <PageHeader title="All documents" />
      {data.documents.length === 0 ? (
        <EmptyState title="No one has saved a document yet" />
      ) : (
        <div className="grid gap-3">
          {data.documents.map((doc) => (
            <Card key={doc.id} data-testid="admin-document" className="flex-row items-center gap-4 p-3">
              <div className="w-24 shrink-0">
                <DocumentThumbnail doc={doc} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.ownerEmail} · {doc.width} × {doc.height} px ·{" "}
                  <time suppressHydrationWarning>{formatTime(doc.updatedAt)}</time>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${doc.name}`}
                data-testid="admin-delete"
                onClick={() => setDeleting({ id: doc.id, name: doc.name })}
              >
                <Trash2 />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        >
          Its owner loses it too, and it can’t be recovered.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
