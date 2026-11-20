import type { BlendMode, TextStyle } from "@/shared/bundle";
import type { Doc, Layer, RasterLayer, TextLayer } from "./model";
import { applyAdjustment, type Adjustment } from "./pixels";

// Drawing: the composite, text, and the pixel and geometry edits that make
// new canvases.

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", { willReadFrequently: true })!;
}

export const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
};

const font = (size: number) => `${size}px sans-serif`;

/** The text's box, from its top-left corner. */
export function measureText(text: TextStyle) {
  const ctx = context(makeCanvas(1, 1));
  ctx.font = font(text.size);
  const lines = text.content.split("\n");
  const width = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  return { width: Math.ceil(width) + 2, height: Math.ceil(lines.length * text.size * 1.25) };
}

export function renderText(text: TextStyle) {
  const box = measureText(text);
  const canvas = makeCanvas(box.width, box.height);
  const ctx = context(canvas);
  ctx.font = font(text.size);
  ctx.fillStyle = text.color;
  ctx.textBaseline = "top";
  text.content.split("\n").forEach((line, i) => {
    ctx.fillText(line, 0, i * text.size * 1.25 + text.size * 0.1);
  });
  return canvas;
}

/** What a layer draws: its canvas, or its rendered text. */
export function layerImage(layer: Layer) {
  return layer.kind === "raster" ? layer.canvas : renderText(layer.text);
}

export interface Override {
  canvas?: HTMLCanvasElement;
  x?: number;
  y?: number;
}

export function composite(
  doc: Doc,
  overrides: Map<string, Override> = new Map(),
  target = makeCanvas(doc.width, doc.height),
) {
  if (target.width !== doc.width) target.width = doc.width;
  if (target.height !== doc.height) target.height = doc.height;
  const ctx = context(target);
  ctx.clearRect(0, 0, doc.width, doc.height);
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const override = overrides.get(layer.id);
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = COMPOSITE[layer.blend];
    ctx.drawImage(
      override?.canvas ?? layerImage(layer),
      override?.x ?? layer.x,
      override?.y ?? layer.y,
    );
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return target;
}

export function scaled(source: HTMLCanvasElement, width: number, height: number, fill?: string) {
  const canvas = makeCanvas(width, height);
  const ctx = context(canvas);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export function thumbnail(doc: Doc, longest = 320) {
  const full = composite(doc);
  const ratio = Math.min(1, longest / Math.max(doc.width, doc.height));
  return scaled(full, doc.width * ratio, doc.height * ratio);
}

/** A raster layer's pixels on a document-sized canvas at 0,0. */
function onDocument(doc: Doc, layer: RasterLayer) {
  const canvas = makeCanvas(doc.width, doc.height);
  context(canvas).drawImage(layer.canvas, layer.x, layer.y);
  return canvas;
}

export function adjusted(source: HTMLCanvasElement, op: Adjustment) {
  const src = context(source).getImageData(0, 0, source.width, source.height);
  const out = applyAdjustment(src, op);
  const canvas = makeCanvas(source.width, source.height);
  context(canvas).putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  return canvas;
}

export function rasterize(layer: TextLayer): RasterLayer {
  const { text: _text, ...rest } = layer;
  return { ...rest, kind: "raster", canvas: renderText(layer.text) };
}

/** The upper layer drawn into the lower, which keeps its own properties. */
export function mergeDown(doc: Doc, upper: Layer, lower: RasterLayer): RasterLayer {
  const canvas = onDocument(doc, lower);
  if (upper.visible) {
    const ctx = context(canvas);
    ctx.globalAlpha = upper.opacity / 100;
    ctx.globalCompositeOperation = COMPOSITE[upper.blend];
    ctx.drawImage(layerImage(upper), upper.x, upper.y);
  }
  return { ...lower, canvas, x: 0, y: 0 };
}

export type Turn = "cw" | "ccw" | "flipH" | "flipV";

/** Rotates or flips the whole canvas. Text keeps its orientation and moves with its box. */
export function turnDoc(doc: Doc, turn: Turn): Doc {
  const rotates = turn === "cw" || turn === "ccw";
  const width = rotates ? doc.height : doc.width;
  const height = rotates ? doc.width : doc.height;
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === "text") {
      const box = measureText(layer.text);
      const cx = layer.x + box.width / 2;
      const cy = layer.y + box.height / 2;
      const [nx, ny] =
        turn === "cw" ? [doc.height - cy, cx]
        : turn === "ccw" ? [cy, doc.width - cx]
        : turn === "flipH" ? [doc.width - cx, cy]
        : [cx, doc.height - cy];
      return { ...layer, x: Math.round(nx - box.width / 2), y: Math.round(ny - box.height / 2) };
    }
    const source = onDocument(doc, layer);
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    if (turn === "cw") {
      ctx.translate(width, 0);
      ctx.rotate(Math.PI / 2);
    } else if (turn === "ccw") {
      ctx.translate(0, height);
      ctx.rotate(-Math.PI / 2);
    } else if (turn === "flipH") {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(source, 0, 0);
    return { ...layer, canvas, x: 0, y: 0 };
  });
  return { width, height, layers };
}

export function resizeDoc(doc: Doc, width: number, height: number): Doc {
  const sx = width / doc.width;
  const sy = height / doc.height;
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === "text")
      return {
        ...layer,
        x: Math.round(layer.x * sx),
        y: Math.round(layer.y * sy),
        text: { ...layer.text, size: Math.max(1, Math.round(layer.text.size * Math.min(sx, sy))) },
      };
    return { ...layer, canvas: scaled(onDocument(doc, layer), width, height), x: 0, y: 0 };
  });
  return { width, height, layers };
}

export function cropDoc(doc: Doc, rect: { x: number; y: number; width: number; height: number }): Doc {
  const layers = doc.layers.map((layer): Layer => {
    if (layer.kind === "text") return { ...layer, x: layer.x - rect.x, y: layer.y - rect.y };
    const canvas = makeCanvas(rect.width, rect.height);
    context(canvas).drawImage(layer.canvas, layer.x - rect.x, layer.y - rect.y);
    return { ...layer, canvas, x: 0, y: 0 };
  });
  return { width: rect.width, height: rect.height, layers };
}

/** A canvas covering both the layer and the document, for painting. */
export function paintSurface(doc: Doc, layer: RasterLayer) {
  const left = Math.min(0, layer.x);
  const top = Math.min(0, layer.y);
  const right = Math.max(doc.width, layer.x + layer.canvas.width);
  const bottom = Math.max(doc.height, layer.y + layer.canvas.height);
  const canvas = makeCanvas(right - left, bottom - top);
  context(canvas).drawImage(layer.canvas, layer.x - left, layer.y - top);
  return { canvas, x: left, y: top };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))), type, quality),
  );
}
