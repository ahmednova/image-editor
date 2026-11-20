import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Merge, Pencil, Plus, Trash2, Type,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/client/components/ui/select";
import { BLEND_MODES, type BlendMode } from "@/shared/bundle";
import { context, layerImage } from "./canvas";
import type { Doc, Layer } from "./model";

const BLEND_LABELS: Record<BlendMode, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  difference: "Difference",
};

function LayerThumb({ layer, doc }: { layer: Layer; doc: Doc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = Math.min(40 / doc.width, 40 / doc.height);
    canvas.width = Math.max(1, Math.round(doc.width * scale));
    canvas.height = Math.max(1, Math.round(doc.height * scale));
    const ctx = context(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(layerImage(layer), layer.x, layer.y);
  }, [layer, doc.width, doc.height]);
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded border border-border bg-muted">
      <canvas ref={ref} className="max-h-10 max-w-10" />
    </span>
  );
}

export interface LayerActions {
  select: (id: string) => void;
  add: () => void;
  duplicate: () => void;
  remove: () => void;
  move: (step: 1 | -1) => void;
  moveTo: (id: string, index: number) => void;
  mergeDown: () => void;
  rename: () => void;
  change: (change: Partial<Pick<Layer, "name" | "visible" | "opacity" | "blend" | "lockPixels" | "lockPosition">>, id?: string) => void;
  editText: () => void;
  rasterize: () => void;
}

export function LayersPanel({ doc, selectedId, actions }: { doc: Doc; selectedId: string; actions: LayerActions }) {
  const index = doc.layers.findIndex((layer) => layer.id === selectedId);
  const selected = doc.layers[index];
  const [opacity, setOpacity] = useState(String(selected?.opacity ?? 100));
  useEffect(() => setOpacity(String(selected?.opacity ?? 100)), [selected?.id, selected?.opacity]);
  const [dragging, setDragging] = useState<string | null>(null);

  const commitOpacity = () => {
    const value = Math.round(Number(opacity));
    if (!Number.isFinite(value)) return setOpacity(String(selected?.opacity ?? 100));
    const clamped = Math.min(100, Math.max(0, value));
    setOpacity(String(clamped));
    if (selected && clamped !== selected.opacity) actions.change({ opacity: clamped });
  };

  const top = [...doc.layers].reverse();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Layers</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid max-h-80 gap-1 overflow-y-auto" aria-label="Layers">
          {top.map((layer) => {
            const position = doc.layers.indexOf(layer);
            const isSelected = layer.id === selectedId;
            return (
              <li
                key={layer.id}
                data-testid="layer-row"
                data-name={layer.name}
                data-kind={layer.kind}
                data-selected={isSelected}
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.setData("text/x-layer", layer.id);
                  setDragging(layer.id);
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (dragging) event.preventDefault();
                }}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData("text/x-layer");
                  if (!id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  actions.moveTo(id, position);
                  setDragging(null);
                }}
                onClick={() => actions.select(layer.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                  isSelected ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
                  dragging === layer.id && "opacity-50",
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  data-testid="layer-visibility"
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  aria-pressed={layer.visible}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.change({ visible: !layer.visible }, layer.id);
                  }}
                >
                  {layer.visible ? <Eye /> : <EyeOff className="text-muted-foreground" />}
                </Button>
                <LayerThumb layer={layer} doc={doc} />
                <span className={cn("min-w-0 flex-1 truncate", !layer.visible && "text-muted-foreground")}>{layer.name}</span>
                {layer.kind === "text" ? <Type className="size-3.5 text-muted-foreground" aria-label="Text layer" /> : null}
                {layer.lockPixels || layer.lockPosition ? <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" /> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-1">
          <IconButton label="New layer" testId="add-layer" onClick={actions.add}><Plus /></IconButton>
          <IconButton label="Duplicate layer" testId="duplicate-layer" onClick={actions.duplicate}><Copy /></IconButton>
          <IconButton label="Rename layer" testId="rename-layer" onClick={actions.rename}><Pencil /></IconButton>
          <IconButton label="Move layer up" testId="layer-up" onClick={() => actions.move(1)} disabled={index >= doc.layers.length - 1}><ArrowUp /></IconButton>
          <IconButton label="Move layer down" testId="layer-down" onClick={() => actions.move(-1)} disabled={index <= 0}><ArrowDown /></IconButton>
          <IconButton label="Merge down" testId="merge-down" onClick={actions.mergeDown} disabled={index <= 0}><Merge /></IconButton>
          <IconButton label="Delete layer" testId="delete-layer" onClick={actions.remove} disabled={doc.layers.length <= 1}><Trash2 /></IconButton>
        </div>
        {selected ? (
          <div className="grid gap-3 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="layer-opacity">Opacity (%)</Label>
                <Input
                  id="layer-opacity"
                  data-testid="layer-opacity"
                  type="number"
                  min={0}
                  max={100}
                  className="h-8"
                  value={opacity}
                  onChange={(event) => setOpacity(event.target.value)}
                  onBlur={commitOpacity}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitOpacity();
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Blend mode</Label>
                <Select
                  value={selected.blend}
                  items={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode] }))}
                  onValueChange={(value) => value && actions.change({ blend: value as BlendMode })}
                >
                  <SelectTrigger data-testid="layer-blend" size="sm" className="w-full" aria-label="Blend mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLEND_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>{BLEND_LABELS[mode]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="lock-pixels" data-testid="lock-pixels" checked={selected.lockPixels} onCheckedChange={(checked) => actions.change({ lockPixels: checked === true })} />
                <Label htmlFor="lock-pixels">Lock pixels</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="lock-position" data-testid="lock-position" checked={selected.lockPosition} onCheckedChange={(checked) => actions.change({ lockPosition: checked === true })} />
                <Label htmlFor="lock-position">Lock position</Label>
              </div>
            </div>
            {selected.kind === "text" ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={actions.editText} data-testid="edit-text">Edit text</Button>
                <Button variant="outline" size="sm" onClick={actions.rasterize} data-testid="rasterize-layer">Rasterize</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IconButton({
  label, testId, onClick, disabled, children,
}: { label: string; testId: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button variant="outline" size="icon-sm" aria-label={label} title={label} data-testid={testId} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
