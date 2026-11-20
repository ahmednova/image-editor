// Adjustments and filters on RGBA pixels. Pure: each returns new pixels,
// so the editor can preview one and throw it away.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Adjustment =
  | { kind: "brightnessContrast"; brightness: number; contrast: number }
  | { kind: "hueSaturation"; hue: number; saturation: number; lightness: number }
  | { kind: "levels"; black: number; white: number; gamma: number }
  | { kind: "invert" }
  | { kind: "grayscale" }
  | { kind: "gaussianBlur"; radius: number }
  | { kind: "sharpen"; amount: number };

export function applyAdjustment(src: Pixels, op: Adjustment): Pixels {
  switch (op.kind) {
    case "brightnessContrast":
      return brightnessContrast(src, op.brightness, op.contrast);
    case "hueSaturation":
      return hueSaturation(src, op.hue, op.saturation, op.lightness);
    case "levels":
      return levels(src, op.black, op.white, op.gamma);
    case "invert":
      return mapColor(src, (r, g, b) => [255 - r, 255 - g, 255 - b]);
    case "grayscale":
      return mapColor(src, (r, g, b) => {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        return [y, y, y];
      });
    case "gaussianBlur":
      return gaussianBlur(src, op.radius);
    case "sharpen":
      return sharpen(src, op.amount);
  }
}

function mapColor(
  src: Pixels,
  fn: (r: number, g: number, b: number) => [number, number, number],
): Pixels {
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    const [r, g, b] = fn(out[i]!, out[i + 1]!, out[i + 2]!);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return { width: src.width, height: src.height, data: out };
}

/** brightness and contrast from -100 to 100. */
export function brightnessContrast(src: Pixels, brightness: number, contrast: number) {
  const offset = brightness * 1.5;
  const c = contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const f = (v: number) => factor * (v + offset - 128) + 128;
  return mapColor(src, (r, g, b) => [f(r), f(g), f(b)]);
}

/** hue in degrees from -180 to 180; saturation and lightness from -100 to 100. */
export function hueSaturation(src: Pixels, hue: number, saturation: number, lightness: number) {
  return mapColor(src, (r, g, b) => {
    let [h, s, l] = rgbToHsl(r, g, b);
    h = (((h + hue / 360) % 1) + 1) % 1;
    s = clamp01(saturation < 0 ? s * (1 + saturation / 100) : s + (1 - s) * (saturation / 100) * s);
    l = clamp01(lightness < 0 ? l * (1 + lightness / 100) : l + (1 - l) * (lightness / 100));
    return hslToRgb(h, s, l);
  });
}

/** Input black and white points (0-255) and a midtone gamma. */
export function levels(src: Pixels, black: number, white: number, gamma: number) {
  const span = Math.max(1, white - black);
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++)
    table[v] = 255 * Math.pow(clamp01((v - black) / span), 1 / gamma);
  return mapColor(src, (r, g, b) => [table[r]!, table[g]!, table[b]!]);
}

/** A two-pass gaussian with sigma `radius`, on premultiplied colour. */
export function gaussianBlur(src: Pixels, radius: number): Pixels {
  const { width, height } = src;
  if (radius <= 0) return { width, height, data: new Uint8ClampedArray(src.data) };
  const half = Math.max(1, Math.ceil(radius * 2.5));
  const kernel = new Float32Array(half * 2 + 1);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const w = Math.exp(-(i * i) / (2 * radius * radius));
    kernel[i + half] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= sum;

  const pre = new Float32Array(width * height * 4);
  for (let i = 0; i < pre.length; i += 4) {
    const a = src.data[i + 3]! / 255;
    pre[i] = src.data[i]! * a;
    pre[i + 1] = src.data[i + 1]! * a;
    pre[i + 2] = src.data[i + 2]! * a;
    pre[i + 3] = src.data[i + 3]!;
  }
  const pass = (input: Float32Array, horizontal: boolean) => {
    const output = new Float32Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = -half; k <= half; k++) {
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
          const j = (sy * width + sx) * 4;
          const w = kernel[k + half]!;
          r += input[j]! * w;
          g += input[j + 1]! * w;
          b += input[j + 2]! * w;
          a += input[j + 3]! * w;
        }
        const o = (y * width + x) * 4;
        output[o] = r;
        output[o + 1] = g;
        output[o + 2] = b;
        output[o + 3] = a;
      }
    }
    return output;
  };
  const blurred = pass(pass(pre, true), false);
  const out = new Uint8ClampedArray(blurred.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = blurred[i + 3]!;
    const k = a > 0 ? 255 / a : 0;
    out[i] = blurred[i]! * k;
    out[i + 1] = blurred[i + 1]! * k;
    out[i + 2] = blurred[i + 2]! * k;
    out[i + 3] = a;
  }
  return { width, height, data: out };
}

/** amount from 0 to 100: how strongly edges are lifted. */
export function sharpen(src: Pixels, amount: number): Pixels {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data);
  const a = amount / 100;
  const at = (x: number, y: number, c: number) =>
    data[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4 + c]!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = at(x, y, c);
        const edge = 4 * v - at(x - 1, y, c) - at(x + 1, y, c) - at(x, y - 1, c) - at(x, y + 1, c);
        out[o + c] = v + a * edge;
      }
    }
  }
  return { width, height, data: out };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}
