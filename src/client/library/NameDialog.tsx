import { useEffect, useState } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";

/** Asks for a new name: documents and layers. */
export function NameDialog({
  title,
  initial,
  open,
  onOpenChange,
  onSave,
  testId,
}: {
  title: string;
  initial: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void> | void;
  testId: string;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give it a name.");
    setPending(true);
    try {
      await onSave(name.trim().slice(0, 120));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't rename it.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Input aria-label="Name" data-testid={`${testId}-input`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid={`${testId}-save`}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
