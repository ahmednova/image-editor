import { useState } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { MAX_SIDE } from "@/shared/bundle";

export interface BlankSpec {
  name: string;
  width: number;
  height: number;
  background: "white" | "transparent";
}

export function NewDocumentDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (spec: BlankSpec) => Promise<void>;
}) {
  const [name, setName] = useState("Untitled");
  const [width, setWidth] = useState("1200");
  const [height, setHeight] = useState("800");
  const [background, setBackground] = useState<BlankSpec["background"]>("white");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const w = Number(width);
    const h = Number(height);
    if (!name.trim()) return setError("Give it a name.");
    if (![w, h].every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE))
      return setError(`Width and height are whole numbers from 1 to ${MAX_SIDE}.`);
    setError(null);
    setPending(true);
    try {
      await onCreate({ name: name.trim(), width: w, height: h, background });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create it.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" data-testid="new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="new-width">Width (px)</Label>
              <Input id="new-width" data-testid="new-width" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-height">Height (px)</Label>
              <Input id="new-height" data-testid="new-height" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Background</Label>
            <ToggleGroup
              variant="outline"
              value={[background]}
              onValueChange={(value) => {
                const next = value[0] as BlankSpec["background"] | undefined;
                if (next) setBackground(next);
              }}
            >
              <ToggleGroupItem value="white" data-testid="bg-white">White</ToggleGroupItem>
              <ToggleGroupItem value="transparent" data-testid="bg-transparent">Transparent</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid="create-document">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
