import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";

export interface CardDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  version: number;
  updatedAt: number;
}

export const formatTime = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function DocumentThumbnail({ doc }: { doc: CardDocument }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
      <img
        src={`/api/documents/${doc.id}/thumbnail?v=${doc.version}`}
        alt=""
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

export function DocumentCard({
  doc,
  onRename,
  onDelete,
}: {
  doc: CardDocument;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <Card data-testid="document-card" className="gap-3 p-3">
      <Link to="/documents/$id" params={{ id: doc.id }} className="grid gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <DocumentThumbnail doc={doc} />
        <span className="truncate font-medium">{doc.name}</span>
      </Link>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {doc.width} × {doc.height} px · <time suppressHydrationWarning>{formatTime(doc.updatedAt)}</time>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.name}`} data-testid="document-actions" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
