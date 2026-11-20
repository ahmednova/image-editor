import { Link } from "@tanstack/react-router";
import {
  Brush, ChevronDown, ChevronLeft, Crop, Download, Eraser, FileDown, Move, Redo2, Save, Type, Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import type { TextStyle } from "@/shared/bundle";
import { ADJUSTMENTS, AdjustPanel, initialAdjustment } from "./AdjustPanel";
import {
  adjusted, composite, context, cropDoc, makeCanvas, mergeDown, paintSurface, rasterize, resizeDoc, turnDoc,
  type Override, type Turn,
} from "./canvas";
import { ExportDialog, ResizeDialog, TextDialog } from "./EditorDialogs";
import { baseName, download, exportImage, exportPsd, openFile, saveDocumentData, type ExportFormat } from "./io";
import { LayersPanel, type LayerActions } from "./LayersPanel";
import {
  commit, indexOf, insertAbove, layerDefaults, moveLayer, moveLayerTo, newId, nextLayerName, redo, removeLayer,
  undo, updateLayer, type Doc, type History, type Layer, type RasterLayer,
} from "./model";
import type { Adjustment } from "./pixels";
import { NameDialog } from "@/client/library/NameDialog";

type Tool = "move" | "brush" | "eraser" | "crop" | "text";

const TOOLS: { value: Tool; label: string; icon: typeof Move }[] = [
  { value: "move", label: "Move", icon: Move },
  { value: "brush", label: "Brush", icon: Brush },
  { value: "eraser", label: "Eraser", icon: Eraser },
  { value: "crop", label: "Crop", icon: Crop },
  { value: "text", label: "Text", icon: Type },
];

const REFUSED = {
  pixels: "This layer's pixels are locked",
  position: "This layer's position is locked",
  text: "Rasterize the text layer first",
};

interface Rect { x: number; y: number; width: number; height: number }

type Gesture =
  | { kind: "paint"; layer: RasterLayer; surface: ReturnType<typeof paintSurface>; stroke: HTMLCanvasElement; preview: HTMLCanvasElement; last: [number, number]; erase: boolean; opacity: number }
  | { kind: "move"; layer: Layer; start: [number, number]; dx: number; dy: number }
  | { kind: "crop"; start: [number, number] };

export interface EditorDocument {
  id: string;
  name: string;
  version: number;
}

export function Editor({ meta, initial }: { meta: EditorDocument; initial: { doc: Doc; version: number } }) {
  const [history, setHistory] = useState<History>({ past: [], present: initial.doc, future: [] });
  const doc = history.present;
  const [saved, setSaved] = useState<{ doc: Doc; version: number }>(initial);
  const [selectedId, setSelectedId] = useState(initial.doc.layers.at(-1)!.id);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState({ size: "24", color: "#1f2937", opacity: "100" });
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [preview, setPreview] = useState<Map<string, Override>>(new Map());
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [dialog, setDialog] = useState<null | "resize" | "export" | "rename">(null);
  const [textDialog, setTextDialog] = useState<null | { mode: "new"; x: number; y: number } | { mode: "edit"; id: string }>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const dirty = doc !== saved.doc;
  const selected = doc.layers.find((layer) => layer.id === selectedId) ?? doc.layers.at(-1)!;

  // The selection survives undo: when its layer is gone, the top layer is selected.
  useEffect(() => {
    if (!doc.layers.some((layer) => layer.id === selectedId)) setSelectedId(doc.layers.at(-1)!.id);
  }, [doc, selectedId]);

  useEffect(() => {
    if (canvasRef.current) composite(doc, preview, canvasRef.current);
  }, [doc, preview]);

  const apply = useCallback((next: Doc | null, select?: string) => {
    if (!next) return;
    setHistory((h) => commit(h, next));
    if (select) setSelectedId(select);
  }, []);

  // ---- refusals
  const refusePixels = (layer: Layer) => {
    if (layer.kind === "text") return toast.error(REFUSED.text), true;
    if (layer.lockPixels) return toast.error(REFUSED.pixels), true;
    return false;
  };

  // ---- adding images as layers (drop, paste)
  const insertFile = useCallback(
    async (file: File) => {
      try {
        const opened = await openFile(file);
        let next = doc;
        let above = selectedId;
        for (const layer of opened.layers) {
          const placed: Layer =
            opened.layers.length === 1
              ? { ...layer, name: baseName(file.name), x: Math.round((doc.width - opened.width) / 2), y: Math.round((doc.height - opened.height) / 2) }
              : layer;
          next = insertAbove(next, above, placed);
          above = placed.id;
        }
        apply(next, above);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "That file couldn't be opened.");
      }
    },
    [apply, doc, selectedId],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])][0];
      if (!file) return;
      event.preventDefault();
      void insertFile(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [insertFile]);

  const doUndo = useCallback(() => {
    setAdjustment(null);
    setPreview(new Map());
    setHistory(undo);
  }, []);
  const doRedo = useCallback(() => {
    setAdjustment(null);
    setPreview(new Map());
    setHistory(redo);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      event.preventDefault();
      if (event.shiftKey) doRedo();
      else doUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // ---- pointer gestures on the canvas
  const toDoc = (event: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [((event.clientX - rect.left) * doc.width) / rect.width, ((event.clientY - rect.top) * doc.height) / rect.height];
  };
  const clampToDoc = ([x, y]: [number, number]): [number, number] => [
    Math.min(doc.width, Math.max(0, Math.round(x))),
    Math.min(doc.height, Math.max(0, Math.round(y))),
  ];

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || adjustment) return;
    const point = toDoc(event);
    if (tool === "text") {
      setTextDialog({ mode: "new", x: Math.round(point[0]), y: Math.round(point[1]) });
      return;
    }
    if (tool === "crop") {
      gesture.current = { kind: "crop", start: clampToDoc(point) };
      setCropRect(null);
    } else if (tool === "move") {
      if (selected.lockPosition) return void toast.error(REFUSED.position);
      gesture.current = { kind: "move", layer: selected, start: point, dx: 0, dy: 0 };
    } else {
      if (refusePixels(selected) || selected.kind !== "raster") return;
      if (!selected.visible) return void toast.error("Show the layer to paint on it");
      const surface = paintSurface(doc, selected);
      const stroke = makeCanvas(surface.canvas.width, surface.canvas.height);
      const preview = makeCanvas(surface.canvas.width, surface.canvas.height);
      const opacity = Math.min(100, Math.max(1, Number(brush.opacity) || 100)) / 100;
      gesture.current = { kind: "paint", layer: selected, surface, stroke, preview, last: point, erase: tool === "eraser", opacity };
      paintTo(point);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function paintTo(point: [number, number]) {
    const g = gesture.current;
    if (g?.kind !== "paint") return;
    const ctx = context(g.stroke);
    const size = Math.min(500, Math.max(1, Number(brush.size) || 1));
    ctx.strokeStyle = brush.color;
    ctx.fillStyle = brush.color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const [ox, oy] = [g.surface.x, g.surface.y];
    ctx.beginPath();
    ctx.moveTo(g.last[0] - ox, g.last[1] - oy);
    ctx.lineTo(point[0] - ox, point[1] - oy);
    ctx.stroke();
    g.last = point;
    const pctx = context(g.preview);
    pctx.globalCompositeOperation = "source-over";
    pctx.globalAlpha = 1;
    pctx.clearRect(0, 0, g.preview.width, g.preview.height);
    pctx.drawImage(g.surface.canvas, 0, 0);
    pctx.globalAlpha = g.opacity;
    pctx.globalCompositeOperation = g.erase ? "destination-out" : "source-over";
    pctx.drawImage(g.stroke, 0, 0);
    composite(doc, new Map([[g.layer.id, { canvas: g.preview, x: g.surface.x, y: g.surface.y }]]), canvasRef.current!);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g) return;
    const point = toDoc(event);
    if (g.kind === "paint") paintTo(point);
    else if (g.kind === "move") {
      g.dx = Math.round(point[0] - g.start[0]);
      g.dy = Math.round(point[1] - g.start[1]);
      composite(doc, new Map([[g.layer.id, { x: g.layer.x + g.dx, y: g.layer.y + g.dy }]]), canvasRef.current!);
    } else {
      const [x2, y2] = clampToDoc(point);
      const [x1, y1] = g.start;
      setCropRect({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "paint") {
      const canvas = makeCanvas(g.preview.width, g.preview.height);
      context(canvas).drawImage(g.preview, 0, 0);
      apply(updateLayer(doc, g.layer.id, (layer) => ({ ...layer, canvas, x: g.surface.x, y: g.surface.y }) as Layer));
    } else if (g.kind === "move") {
      if (g.dx || g.dy) apply(updateLayer(doc, g.layer.id, (layer) => ({ ...layer, x: layer.x + g.dx, y: layer.y + g.dy })));
      else composite(doc, preview, canvasRef.current!);
    }
  }

  // ---- layer actions
  const actions: LayerActions = {
    select: setSelectedId,
    add: () => {
      const canvas = makeCanvas(doc.width, doc.height);
      const layer: Layer = { ...layerDefaults(nextLayerName(doc)), kind: "raster", canvas };
      apply(insertAbove(doc, selected.id, layer), layer.id);
    },
    duplicate: () => {
      const copy = { ...selected, id: newId(), name: `${selected.name} copy` };
      apply(insertAbove(doc, selected.id, copy), copy.id);
    },
    remove: () => {
      const result = removeLayer(doc, selected.id);
      if (result) apply(result.doc, result.selected);
    },
    move: (step) => apply(moveLayer(doc, selected.id, step)),
    moveTo: (id, index) => apply(moveLayerTo(doc, id, index)),
    mergeDown: () => {
      const at = indexOf(doc, selected.id);
      const lower = doc.layers[at - 1];
      if (!lower) return;
      if (lower.kind === "text") return void toast.error(REFUSED.text);
      if (lower.lockPixels) return void toast.error("The layer below has locked pixels");
      const merged = mergeDown(doc, selected, lower);
      apply({ ...doc, layers: doc.layers.filter((l) => l.id !== selected.id).map((l) => (l.id === lower.id ? merged : l)) }, lower.id);
    },
    rename: () => setDialog("rename"),
    change: (change, id = selected.id) => apply(updateLayer(doc, id, (layer) => ({ ...layer, ...change }) as Layer)),
    editText: () => setTextDialog({ mode: "edit", id: selected.id }),
    rasterize: () => {
      if (selected.kind === "text") apply(updateLayer(doc, selected.id, (layer) => rasterize(layer as Extract<Layer, { kind: "text" }>)));
    },
  };

  // ---- adjustments: a live preview of the selected layer until Apply or Cancel
  function startAdjustment(kind: Adjustment["kind"]) {
    if (refusePixels(selected)) return;
    setAdjustment(initialAdjustment(kind));
  }
  useEffect(() => {
    if (!adjustment || selected.kind !== "raster") {
      setPreview((current) => (current.size ? new Map() : current));
      return;
    }
    setPreview(new Map([[selected.id, { canvas: adjusted(selected.canvas, adjustment) }]]));
  }, [adjustment, selected]);
  function applyAdjustment() {
    const canvas = preview.get(selected.id)?.canvas;
    setAdjustment(null);
    if (canvas) apply(updateLayer(doc, selected.id, (layer) => ({ ...layer, canvas }) as Layer));
  }

  function turn(how: Turn) {
    apply(turnDoc(doc, how));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const current = doc;
    try {
      const outcome = await saveDocumentData(meta.id, saved.version, current);
      if (outcome.ok) {
        setSaved({ doc: current, version: outcome.version });
        toast.success("Saved");
      } else setSaveError(outcome.message);
    } catch {
      setSaveError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const textInitial = useMemo((): TextStyle => {
    if (textDialog?.mode === "edit") {
      const layer = doc.layers.find((l) => l.id === textDialog.id);
      if (layer?.kind === "text") return layer.text;
    }
    return { content: "", size: 48, color: brush.color };
  }, [textDialog, doc, brush.color]);

  function saveText(text: TextStyle) {
    const name = text.content.split("\n")[0]!.trim().slice(0, 60) || "Text";
    if (textDialog?.mode === "edit") {
      apply(updateLayer(doc, textDialog.id, (layer) => ({ ...layer, name, text }) as Layer));
    } else if (textDialog) {
      const layer: Layer = { ...layerDefaults(name), kind: "text", text, x: textDialog.x, y: textDialog.y };
      apply(insertAbove(doc, selected.id, layer), layer.id);
    }
  }

  const fileName = (ext: string) => `${meta.name}.${ext}`;

  const header = (
    <PageHeader
      title={meta.name}
      backLink={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          Documents
        </Link>
      }
      description={
        <span className="flex items-center gap-2">
          <span data-testid="document-size">{doc.width} × {doc.height} px</span>
          {dirty ? <Badge variant="secondary" data-testid="unsaved">Unsaved changes</Badge> : null}
        </span>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Undo" title="Undo" data-testid="undo" disabled={!history.past.length} onClick={doUndo}><Undo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo" title="Redo" data-testid="redo" disabled={!history.future.length} onClick={doRedo}><Redo2 /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" data-testid="image-menu" />}>
              Image <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setDialog("resize")}>Image size</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => turn("cw")}>Rotate 90° clockwise</DropdownMenuItem>
              <DropdownMenuItem onClick={() => turn("ccw")}>Rotate 90° counter-clockwise</DropdownMenuItem>
              <DropdownMenuItem onClick={() => turn("flipH")}>Flip horizontal</DropdownMenuItem>
              <DropdownMenuItem onClick={() => turn("flipV")}>Flip vertical</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" data-testid="adjust-menu" />}>
              Adjust <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {ADJUSTMENTS.filter((a) => !a.filter).map((a) => (
                <DropdownMenuItem key={a.kind} onClick={() => startAdjustment(a.kind)}>{a.label}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {ADJUSTMENTS.filter((a) => a.filter).map((a) => (
                <DropdownMenuItem key={a.kind} onClick={() => startAdjustment(a.kind)}>{a.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" data-testid="export" onClick={() => setDialog("export")}><Download /> Export</Button>
          <Button
            variant="outline"
            data-testid="save-psd"
            onClick={async () => download(await exportPsd(doc), fileName("psd"))}
          >
            <FileDown /> Save as PSD
          </Button>
          <Button data-testid="save" pending={saving} onClick={save}><Save /> Save</Button>
        </>
      }
    />
  );

  return (
    <AppShell wide>
      {header}
      {saveError ? (
        <Alert variant="destructive" data-testid="save-error">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <ToggleGroup
          variant="outline"
          aria-label="Tools"
          value={[tool]}
          onValueChange={(value) => {
            const next = value[0] as Tool | undefined;
            if (next) {
              setTool(next);
              setCropRect(null);
            }
          }}
        >
          {TOOLS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label} title={label} data-testid={`tool-${value}`}>
              <Icon />
              <span className="hidden sm:inline">{label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tool === "brush" || tool === "eraser" ? (
          <div className="flex items-end gap-3">
            <ToolField label="Size (px)" id="brush-size" value={brush.size} onChange={(size) => setBrush({ ...brush, size })} />
            <ToolField label="Opacity (%)" id="brush-opacity" value={brush.opacity} onChange={(opacity) => setBrush({ ...brush, opacity })} />
            {tool === "brush" ? (
              <div className="grid gap-1">
                <Label htmlFor="brush-color" className="text-xs">Colour</Label>
                <Input id="brush-color" data-testid="brush-color" type="color" className="h-8 w-14 p-1" value={brush.color} onChange={(e) => setBrush({ ...brush, color: e.target.value })} />
              </div>
            ) : null}
          </div>
        ) : null}
        {tool === "crop" && cropRect && cropRect.width >= 1 && cropRect.height >= 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{cropRect.width} × {cropRect.height} px</span>
            <Button size="sm" data-testid="crop-apply" onClick={() => { apply(cropDoc(doc, cropRect)); setCropRect(null); }}>Crop</Button>
            <Button size="sm" variant="outline" onClick={() => setCropRect(null)}>Cancel</Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div
          data-testid="editor-stage"
          className="flex min-h-64 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-muted/40 p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const file = event.dataTransfer?.files[0];
            if (!file) return;
            event.preventDefault();
            void insertFile(file);
          }}
        >
          <div className="relative inline-block max-w-full">
            <canvas
              ref={canvasRef}
              data-testid="editor-canvas"
              aria-label={`${meta.name} canvas`}
              className="block max-h-[70dvh] max-w-full touch-none shadow-sm"
              style={{
                aspectRatio: `${doc.width} / ${doc.height}`,
                cursor: tool === "move" ? "move" : "crosshair",
                backgroundImage: "repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%)",
                backgroundSize: "16px 16px",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {cropRect ? (
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                style={{
                  left: `${(cropRect.x / doc.width) * 100}%`,
                  top: `${(cropRect.y / doc.height) * 100}%`,
                  width: `${(cropRect.width / doc.width) * 100}%`,
                  height: `${(cropRect.height / doc.height) * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>
        <aside className="grid w-full gap-4 lg:w-80 lg:shrink-0">
          {adjustment ? (
            <AdjustPanel value={adjustment} onChange={setAdjustment} onApply={applyAdjustment} onCancel={() => setAdjustment(null)} />
          ) : null}
          <LayersPanel doc={doc} selectedId={selected.id} actions={actions} />
        </aside>
      </div>

      <ResizeDialog
        open={dialog === "resize"}
        onOpenChange={(open) => setDialog(open ? "resize" : null)}
        width={doc.width}
        height={doc.height}
        onApply={(w, h) => apply(resizeDoc(doc, w, h))}
      />
      <ExportDialog
        open={dialog === "export"}
        onOpenChange={(open) => setDialog(open ? "export" : null)}
        width={doc.width}
        height={doc.height}
        onExport={async (format: ExportFormat, w, h, quality) => {
          download(await exportImage(doc, format, w, h, quality), fileName(format));
        }}
      />
      <NameDialog
        title="Rename layer"
        initial={selected.name}
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        testId="layer-name"
        onSave={(name) => actions.change({ name })}
      />
      <TextDialog
        open={textDialog !== null}
        onOpenChange={(open) => !open && setTextDialog(null)}
        initial={textInitial}
        onSave={saveText}
      />
    </AppShell>
  );
}

function ToolField({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} data-testid={id} type="number" min={1} className="h-8 w-20" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
