// Helpers shared by the suites: tiny PNGs made in Node, document bundles and
// API calls the editor's own pages make.
import { deflateSync } from "node:zlib";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGBA PNG; `paint(x, y)` returns [r, g, b, a]. */
export function makePng(width, height, paint) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) row.set(paint(x, y), 1 + x * 4);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export const dataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

/** A saved document as the editor stores it. */
export function bundle({ width = 120, height = 80, layers } = {}) {
  const fill = makePng(width, height, () => [240, 200, 120, 255]);
  return {
    format: 1,
    width,
    height,
    layers: layers ?? [
      {
        name: "Background",
        kind: "raster",
        visible: true,
        opacity: 100,
        blend: "normal",
        lockPixels: false,
        lockPosition: false,
        x: 0,
        y: 0,
        image: dataUrl(fill),
      },
      {
        name: "Caption",
        kind: "text",
        visible: true,
        opacity: 80,
        blend: "multiply",
        lockPixels: false,
        lockPosition: true,
        x: 10,
        y: 10,
        text: { content: "Morning market", size: 18, color: "#203040" },
      },
    ],
  };
}

export function documentForm({ name, data, version }) {
  const form = new FormData();
  if (name !== undefined) form.set("name", name);
  if (version !== undefined) form.set("version", String(version));
  form.set(
    "data",
    new Blob([typeof data === "string" ? data : JSON.stringify(data)], {
      type: "application/json",
    }),
    "document.json",
  );
  form.set(
    "thumbnail",
    new Blob([makePng(16, 12, () => [90, 140, 200, 255])], {
      type: "image/png",
    }),
    "thumbnail.png",
  );
  return form;
}

export async function createDocument(runtime, role, name, data = bundle()) {
  const response = await runtime.fetch("/api/documents", {
    role,
    method: "POST",
    body: documentForm({ name, data }),
  });
  if (response.status !== 201)
    throw new Error(`create ${name}: ${response.status} ${await response.text()}`);
  return response.json();
}

export async function listDocuments(runtime, role) {
  const response = await runtime.fetch("/api/documents", { role });
  if (response.status !== 200) throw new Error(`list: ${response.status}`);
  return response.json();
}
