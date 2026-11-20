import { useEffect, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { MAX_SIDE, type TextStyle } from "@/shared/bundle";
import type { ExportFormat } from "./io";
import { keepRatio } from "./model";

const validSide = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE;

/** Width and height inputs that can keep the ratio of `width` × `height`. */
function SizeFields({
  width,
  height,
  value,
  onChange,
  keep,
  prefix,
}: {
  width: number;
  height: number;
  value: { w: string; h: string };
  onChange: (value: { w: string; h: string }) => void;
  keep: boolean;
  prefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-width`}>Width (px)</Label>
        <Input
          id={`${prefix}-width`}
          data-testid={`${prefix}-width`}
          inputMode="numeric"
          value={value.w}
          onChange={(e) => {
            const w = Number(e.target.value);
            onChange({ w: e.target.value, h: keep && validSide(w) ? String(keepRatio(width, height, w)) : value.h });
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-height`}>Height (px)</Label>
        <Input
          id={`${prefix}-height`}
          data-testid={`${prefix}-height`}
          inputMode="numeric"
          value={value.h}
          onChange={(e) => {
            const h = Number(e.target.value);
            onChange({ h: e.target.value, w: keep && validSide(h) ? String(keepRatio(height, width, h)) : value.w });
          }}
        />
      </div>
    </div>
  );
}

function KeepRatio({ keep, onChange, id }: { keep: boolean; onChange: (keep: boolean) => void; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} data-testid={id} checked={keep} onCheckedChange={(checked) => onChange(checked === true)} />
      <Label htmlFor={id}>Keep aspect ratio</Label>
    </div>
  );
}

export function ResizeDialog({
  open,
  onOpenChange,
  width,
  height,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  height: number;
  onApply: (width: number, height: number) => void;
}) {
  const [size, setSize] = useState({ w: String(width), h: String(height) });
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setSize({ w: String(width), h: String(height) });
      setError(null);
    }
  }, [open, width, height]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const w = Number(size.w);
            const h = Number(size.h);
            if (!validSide(w) || !validSide(h)) return setError(`Use whole numbers from 1 to ${MAX_SIDE}.`);
            onApply(w, h);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Image size</DialogTitle>
          </DialogHeader>
          <SizeFields width={width} height={height} value={size} onChange={setSize} keep={keep} prefix="resize" />
          <KeepRatio keep={keep} onChange={setKeep} id="resize-keep" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" data-testid="resize-apply">Resize</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  width,
  height,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  height: number;
  onExport: (format: ExportFormat, width: number, height: number, quality: number) => Promise<void>;
}) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState("90");
  const [size, setSize] = useState({ w: String(width), h: String(height) });
  const [keep, setKeep] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setSize({ w: String(width), h: String(height) });
      setError(null);
    }
  }, [open, width, height]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const w = Number(size.w);
    const h = Number(size.h);
    const q = Number(quality);
    if (!validSide(w) || !validSide(h)) return setError(`Use whole numbers from 1 to ${MAX_SIDE}.`);
    if (!(q >= 1 && q <= 100)) return setError("Quality is from 1 to 100.");
    setPending(true);
    try {
      await onExport(format, w, h, q);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't export it.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
          </DialogHeader>
          <ToggleGroup
            variant="outline"
            value={[format]}
            onValueChange={(value) => {
              const next = value[0] as ExportFormat | undefined;
              if (next) setFormat(next);
            }}
          >
            <ToggleGroupItem value="png" data-testid="export-png">PNG</ToggleGroupItem>
            <ToggleGroupItem value="jpg" data-testid="export-jpg">JPG</ToggleGroupItem>
            <ToggleGroupItem value="webp" data-testid="export-webp">WEBP</ToggleGroupItem>
          </ToggleGroup>
          {format !== "png" ? (
            <div className="grid gap-2">
              <Label htmlFor="export-quality">Quality (1–100)</Label>
              <Input id="export-quality" data-testid="export-quality" inputMode="numeric" value={quality} onChange={(e) => setQuality(e.target.value)} />
            </div>
          ) : null}
          <SizeFields width={width} height={height} value={size} onChange={setSize} keep={keep} prefix="export" />
          <KeepRatio keep={keep} onChange={setKeep} id="export-keep" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" pending={pending} data-testid="export-download">Download</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TextDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TextStyle;
  onSave: (text: TextStyle) => void;
}) {
  const [content, setContent] = useState(initial.content);
  const [size, setSize] = useState(String(initial.size));
  const [color, setColor] = useState(initial.color);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setContent(initial.content);
      setSize(String(initial.size));
      setColor(initial.color);
      setError(null);
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const s = Number(size);
            if (!content.trim()) return setError("Type some text.");
            if (!(Number.isInteger(s) && s >= 1 && s <= 1000)) return setError("Font size is a whole number from 1 to 1000.");
            onSave({ content: content.slice(0, 2000), size: s, color });
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Text</DialogTitle>
          </DialogHeader>
          <Textarea aria-label="Text" data-testid="text-content" value={content} onChange={(e) => setContent(e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="text-size">Font size (px)</Label>
              <Input id="text-size" data-testid="text-size" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="text-color">Colour</Label>
              <Input id="text-color" data-testid="text-color" type="color" className="p-1" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" data-testid="text-save">Done</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
