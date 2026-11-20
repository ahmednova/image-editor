import type { BlendMode, TextStyle } from "@/shared/bundle";

// The open document. Layers are immutable: an edit makes a new layer (and a
// new canvas for pixel edits), so a history step is just the previous Doc.

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** 0 to 100. */
  opacity: number;
  blend: BlendMode;
  lockPixels: boolean;
  lockPosition: boolean;
  x: number;
  y: number;
}
export interface RasterLayer<C = HTMLCanvasElement> extends LayerBase {
  kind: "raster";
  canvas: C;
}
export interface TextLayer extends LayerBase {
  kind: "text";
  text: TextStyle;
}
export type Layer<C = HTMLCanvasElement> = RasterLayer<C> | TextLayer;

export interface Doc<C = HTMLCanvasElement> {
  width: number;
  height: number;
  /** Bottom to top. */
  layers: Layer<C>[];
}

export const newId = () => crypto.randomUUID();

export function layerDefaults(name: string) {
  return {
    id: newId(),
    name,
    visible: true,
    opacity: 100,
    blend: "normal" as BlendMode,
    lockPixels: false,
    lockPosition: false,
    x: 0,
    y: 0,
  };
}

export function indexOf<C>(doc: Doc<C>, id: string) {
  return doc.layers.findIndex((layer) => layer.id === id);
}

/** A copy of the doc with one layer changed. */
export function updateLayer<C>(
  doc: Doc<C>,
  id: string,
  change: (layer: Layer<C>) => Layer<C>,
): Doc<C> {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === id ? change(layer) : layer)),
  };
}

/** Puts `layer` directly above the layer `aboveId` (on top when missing). */
export function insertAbove<C>(doc: Doc<C>, aboveId: string | null, layer: Layer<C>): Doc<C> {
  const at = aboveId ? indexOf(doc, aboveId) : -1;
  const layers = [...doc.layers];
  layers.splice(at < 0 ? layers.length : at + 1, 0, layer);
  return { ...doc, layers };
}

export function removeLayer<C>(doc: Doc<C>, id: string): { doc: Doc<C>; selected: string } | null {
  if (doc.layers.length <= 1) return null;
  const at = indexOf(doc, id);
  if (at < 0) return null;
  const layers = doc.layers.filter((layer) => layer.id !== id);
  return { doc: { ...doc, layers }, selected: layers[Math.max(0, at - 1)]!.id };
}

/** Moves a layer one step up (+1) or down (-1) the stack. */
export function moveLayer<C>(doc: Doc<C>, id: string, step: 1 | -1): Doc<C> | null {
  const at = indexOf(doc, id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= doc.layers.length) return null;
  return moveLayerTo(doc, id, to);
}

export function moveLayerTo<C>(doc: Doc<C>, id: string, to: number): Doc<C> | null {
  const at = indexOf(doc, id);
  if (at < 0 || to === at || to < 0 || to >= doc.layers.length) return null;
  const layers = [...doc.layers];
  const [layer] = layers.splice(at, 1);
  layers.splice(to, 0, layer!);
  return { ...doc, layers };
}

/** "Layer 3": one more than the highest such name. */
export function nextLayerName<C>(doc: Doc<C>) {
  let highest = 0;
  for (const layer of doc.layers) {
    const match = /^Layer (\d+)$/.exec(layer.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Layer ${highest + 1}`;
}

export interface History<C = HTMLCanvasElement> {
  past: Doc<C>[];
  present: Doc<C>;
  future: Doc<C>[];
}

const MAX_STEPS = 60;

export function commit<C>(history: History<C>, doc: Doc<C>): History<C> {
  if (doc === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_STEPS),
    present: doc,
    future: [],
  };
}

export function undo<C>(history: History<C>): History<C> {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<C>(history: History<C>): History<C> {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

/** Fits width × height into a new width, keeping the ratio. */
export function keepRatio(width: number, height: number, newWidth: number) {
  return Math.max(1, Math.round((height * newWidth) / width));
}
