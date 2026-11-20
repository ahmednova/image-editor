import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { Editor } from "@/client/editor/Editor";
import { loadDocumentData } from "@/client/editor/io";
import type { Doc } from "@/client/editor/model";
import { getEditorDocument } from "@/serverFunctions/documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/documents/$id")({
  // The editor draws on canvases, which exist only in the browser.
  ssr: false,
  loader: ({ params }) => (UUID.test(params.id) ? getEditorDocument({ data: { id: params.id } }) : null),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Not found"} · Image Editor` }] }),
  component: EditorPage,
});

function EditorPage() {
  const meta = Route.useLoaderData();
  const [state, setState] = useState<{ doc: Doc; version: number } | { error: string } | null>(null);

  useEffect(() => {
    if (!meta) return;
    let live = true;
    setState(null);
    loadDocumentData(meta.id).then(
      (loaded) => live && setState(loaded),
      (cause: unknown) => live && setState({ error: cause instanceof Error ? cause.message : "Couldn't open it." }),
    );
    return () => {
      live = false;
    };
  }, [meta?.id, meta?.version]);

  if (!meta)
    return (
      <AppShell>
        <PageHeader title="Document not found" />
        <div data-testid="document-missing">
          <EmptyState
            title="This document doesn’t exist or isn’t yours"
            action={<Button render={<Link to="/" />}>Your documents</Button>}
          />
        </div>
      </AppShell>
    );
  if (!state)
    return (
      <AppShell>
        <PageHeader title={meta.name} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Opening…
        </div>
      </AppShell>
    );
  if ("error" in state)
    return (
      <AppShell>
        <PageHeader title={meta.name} />
        <EmptyState kind="error" title="Couldn’t open this document" description={state.error} />
      </AppShell>
    );
  return <Editor key={`${meta.id}`} meta={meta} initial={state} />;
}
