import { BLEND_MODES, MAX_SIDE, documentBundle, type BlendMode, type DocumentBundle } from "@/shared/bundle";
import { canvasToBlob, composite, context, layerImage, makeCanvas, thumbnail } from "./canvas";
import { layerDefaults, type Doc, type Layer } from "./model";

// Files in and out: opening images and PSDs, the saved form, exports.

export class OpenError extends Error {}

const IMAGE_SIGNATURES: [string, number[]][] = [
  ["png", [0x89, 0x50, 0x4e, 0x47]],
  ["jpg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38]],
  ["bmp", [0x42, 0x4d]],
  ["webp", [0x52, 0x49, 0x46, 0x46]],
  ["psd", [0x38, 0x42, 0x50, 0x53]],
];
const EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|psd)$/i;

export const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.psd,image/png,image/jpeg,image/webp,image/gif,image/bmp";

export const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "").trim() || "Untitled";

function sniff(bytes: Uint8Array) {
  return IMAGE_SIGNATURES.find(([, sig]) => sig.every((b, i) => bytes[i] === b))?.[0] ?? null;
}

/** True for a file this app might open, before reading it. */
export function looksOpenable(file: File) {
  return EXTENSIONS.test(file.name) || /^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type);
}

function checkSize(width: number, height: number) {
  if (width > MAX_SIDE || height > MAX_SIDE)
    throw new OpenError(`Images up to ${MAX_SIDE} × ${MAX_SIDE} px can be opened.`);
}

/** One image file as a canvas (a GIF's first frame). */
export async function decodeImage(file: File): Promise<HTMLCanvasElement> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const kind = sniff(bytes);
  if (!kind || kind === "psd") throw new OpenError(`${file.name} isn't a PNG, JPG, WEBP, GIF or BMP image.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OpenError(`${file.name} couldn't be read. It may be damaged.`);
  }
  checkSize(bitmap.width, bitmap.height);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  context(canvas).drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/** A file as a new document's layers. */
export async function openFile(file: File): Promise<Doc> {
  if (!looksOpenable(file)) throw new OpenError(`${file.name} isn't a file this app opens.`);
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (sniff(head) === "psd") return openPsd(file);
  if (/\.psd$/i.test(file.name)) throw new OpenError(`${file.name} couldn't be read. It may be damaged.`);
  const canvas = await decodeImage(file);
  return {
    width: canvas.width,
    height: canvas.height,
    layers: [{ ...layerDefaults("Background"), kind: "raster", canvas }],
  };
}

const PSD_BLENDS = new Set<string>(BLEND_MODES);

async function openPsd(file: File): Promise<Doc> {
  const { readPsd } = await import("ag-psd");
  type PsdLayer = import("ag-psd").Layer;
  let psd: import("ag-psd").Psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true, skipLinkedFilesData: true });
  } catch {
    throw new OpenError(`${file.name} couldn't be read. It may be damaged or use features this app doesn't support.`);
  }
  checkSize(psd.width, psd.height);
  const layers: Layer[] = [];
  const walk = (children: PsdLayer[], hidden: boolean) => {
    for (const child of children) {
      if (child.children) {
        walk(child.children, hidden || !!child.hidden);
        continue;
      }
      const canvas = child.canvas ?? makeCanvas(1, 1);
      layers.push({
        ...layerDefaults(child.name?.trim() || `Layer ${layers.length + 1}`),
        kind: "raster",
        canvas,
        x: child.left ?? 0,
        y: child.top ?? 0,
        visible: !(hidden || child.hidden),
        opacity: Math.round((child.opacity ?? 1) * 100),
        blend: (PSD_BLENDS.has(child.blendMode ?? "") ? child.blendMode : "normal") as BlendMode,
        lockPixels: !!(child.protected?.transparency || child.protected?.composite),
        lockPosition: !!child.protected?.position,
      });
    }
  };
  walk(psd.children ?? [], false);
  if (!layers.length) {
    if (!psd.canvas) throw new OpenError(`${file.name} has no image in it.`);
    layers.push({ ...layerDefaults("Background"), kind: "raster", canvas: psd.canvas });
  }
  return { width: psd.width, height: psd.height, layers };
}

export function blankDoc(width: number, height: number, background: "white" | "transparent"): Doc {
  const canvas = makeCanvas(width, height);
  if (background === "white") {
    const ctx = context(canvas);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  return { width, height, layers: [{ ...layerDefaults("Background"), kind: "raster", canvas }] };
}

export function toBundle(doc: Doc): DocumentBundle {
  return {
    format: 1,
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map((layer) => {
      const { id: _id, ...rest } = layer;
      if (layer.kind === "text") return { ...rest, kind: "text", text: layer.text } as DocumentBundle["layers"][number];
      const { canvas: _canvas, ...props } = rest as typeof rest & { canvas: HTMLCanvasElement };
      return { ...props, kind: "raster", image: layer.canvas.toDataURL("image/png") } as DocumentBundle["layers"][number];
    }),
  };
}

async function loadCanvas(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  context(canvas).drawImage(image, 0, 0);
  return canvas;
}

export async function fromBundle(raw: unknown): Promise<Doc> {
  const bundle = documentBundle.parse(raw);
  const layers = await Promise.all(
    bundle.layers.map(async (saved): Promise<Layer> => {
      const base = {
        ...layerDefaults(saved.name),
        visible: saved.visible,
        opacity: saved.opacity,
        blend: saved.blend,
        lockPixels: saved.lockPixels,
        lockPosition: saved.lockPosition,
        x: saved.x,
        y: saved.y,
      };
      return saved.kind === "text"
        ? { ...base, kind: "text", text: saved.text }
        : { ...base, kind: "raster", canvas: await loadCanvas(saved.image) };
    }),
  );
  return { width: bundle.width, height: bundle.height, layers };
}

/** The form the document routes take. */
export async function documentForm(doc: Doc, extra: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  form.set("data", new Blob([JSON.stringify(toBundle(doc))], { type: "application/json" }), "document.json");
  form.set("thumbnail", await canvasToBlob(thumbnail(doc), "image/png"), "thumbnail.png");
  return form;
}

async function failure(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Something went wrong. Try again.";
}

export async function uploadNewDocument(name: string, doc: Doc): Promise<{ id: string }> {
  const response = await fetch("/api/documents", { method: "POST", body: await documentForm(doc, { name }) });
  if (!response.ok) throw new Error(await failure(response));
  return response.json();
}

export type SaveOutcome = { ok: true; version: number } | { ok: false; stale: boolean; message: string };

export async function saveDocumentData(id: string, version: number, doc: Doc): Promise<SaveOutcome> {
  const response = await fetch(`/api/documents/${id}/data`, {
    method: "PUT",
    body: await documentForm(doc, { version: String(version) }),
  });
  if (response.ok) return { ok: true, version: ((await response.json()) as { version: number }).version };
  return { ok: false, stale: response.status === 409, message: await failure(response) };
}

export async function loadDocumentData(id: string) {
  const response = await fetch(`/api/documents/${id}/data`, { cache: "no-store" });
  if (!response.ok) throw new Error(await failure(response));
  const version = Number(response.headers.get("x-document-version"));
  return { doc: await fromBundle(await response.json()), version };
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ExportFormat = "png" | "jpg" | "webp";
const MIME: Record<ExportFormat, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function exportImage(doc: Doc, format: ExportFormat, width: number, height: number, quality: number) {
  const flat = composite(doc);
  const out = makeCanvas(width, height);
  const ctx = context(out);
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(flat, 0, 0, width, height);
  return canvasToBlob(out, MIME[format], format === "png" ? undefined : quality / 100);
}

export async function exportPsd(doc: Doc) {
  const { writePsd } = await import("ag-psd");
  const buffer = writePsd(
    {
      width: doc.width,
      height: doc.height,
      canvas: composite(doc),
      children: doc.layers.map((layer) => ({
        name: layer.name,
        canvas: layerImage(layer),
        left: layer.x,
        top: layer.y,
        opacity: layer.opacity / 100,
        hidden: !layer.visible,
        blendMode: layer.blend,
        protected: { transparency: layer.lockPixels, position: layer.lockPosition },
      })),
    },
    { generateThumbnail: false },
  );
  return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
}
