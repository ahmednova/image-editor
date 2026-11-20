import { z } from "zod";

// The saved form of a document: every layer with its properties, raster
// pixels as PNG data URLs, text layers as their content. The editor writes
// it (src/client/editor/serialize.ts); the server checks it before storing.

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "difference",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const MAX_SIDE = 8000;

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

const layerBase = {
  name: z.string().trim().min(1).max(120),
  visible: z.boolean(),
  opacity: z.number().int().min(0).max(100),
  blend: z.enum(BLEND_MODES),
  lockPixels: z.boolean(),
  lockPosition: z.boolean(),
  x: z.number().int().min(-4 * MAX_SIDE).max(4 * MAX_SIDE),
  y: z.number().int().min(-4 * MAX_SIDE).max(4 * MAX_SIDE),
};

export const textStyle = z.object({
  content: z.string().min(1).max(2000),
  size: z.number().int().min(1).max(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type TextStyle = z.infer<typeof textStyle>;

const layer = z.discriminatedUnion("kind", [
  z.object({ ...layerBase, kind: z.literal("raster"), image: z.string().regex(PNG_DATA_URL) }),
  z.object({ ...layerBase, kind: z.literal("text"), text: textStyle }),
]);

export const documentBundle = z.object({
  format: z.literal(1),
  width: z.number().int().min(1).max(MAX_SIDE),
  height: z.number().int().min(1).max(MAX_SIDE),
  /** Bottom to top. */
  layers: z.array(layer).min(1).max(200),
});
export type DocumentBundle = z.infer<typeof documentBundle>;
export type SavedLayer = z.infer<typeof layer>;

export const documentName = z.string().trim().min(1, "Give it a name").max(120);
