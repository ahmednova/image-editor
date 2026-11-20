import { describe, expect, it } from "vitest";
import { applyAdjustment, type Pixels } from "./pixels";

const px = (...rgba: number[]): Pixels => ({ width: rgba.length / 4, height: 1, data: new Uint8ClampedArray(rgba) });
const of = (p: Pixels) => Array.from(p.data);

describe("adjustments change colour only", () => {
  it("inverts and greys, keeping alpha", () => {
    expect(of(applyAdjustment(px(10, 20, 30, 128), { kind: "invert" }))).toEqual([245, 235, 225, 128]);
    const [r, g, b, a] = of(applyAdjustment(px(200, 100, 50, 255), { kind: "grayscale" }));
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(a).toBe(255);
  });
  it("desaturates fully at -100 and shifts hue", () => {
    const [r, g, b] = of(applyAdjustment(px(30, 80, 220, 255), { kind: "hueSaturation", hue: 0, saturation: -100, lightness: 0 }));
    expect(Math.abs(r! - b!)).toBeLessThanOrEqual(1);
    expect(Math.abs(g! - b!)).toBeLessThanOrEqual(1);
    const red = of(applyAdjustment(px(255, 0, 0, 255), { kind: "hueSaturation", hue: 120, saturation: 0, lightness: 0 }));
    expect(red.slice(0, 3)).toEqual([0, 255, 0]);
  });
  it("brightens, and levels stretch the range", () => {
    expect(of(applyAdjustment(px(100, 100, 100, 255), { kind: "brightnessContrast", brightness: 50, contrast: 0 }))[0]).toBeGreaterThan(150);
    const leveled = of(applyAdjustment(px(50, 128, 200, 255), { kind: "levels", black: 50, white: 200, gamma: 1 }));
    expect([leveled[0], leveled[2]]).toEqual([0, 255]);
  });
});

describe("filters use neighbouring pixels", () => {
  it("blurs an edge and sharpen lifts it", () => {
    const edge: Pixels = { width: 6, height: 1, data: new Uint8ClampedArray([0,0,0,255, 0,0,0,255, 0,0,0,255, 255,255,255,255, 255,255,255,255, 255,255,255,255]) };
    const blurred = of(applyAdjustment(edge, { kind: "gaussianBlur", radius: 1 }));
    expect(blurred[8]).toBeGreaterThan(0);
    expect(blurred[12]).toBeLessThan(255);
    const sharp = of(applyAdjustment({ ...edge, data: new Uint8ClampedArray(blurred) }, { kind: "sharpen", amount: 100 }));
    expect(sharp[8]).toBeLessThan(blurred[8]!);
  });
  it("does not darken the edges of a transparent layer", () => {
    const blurred = of(applyAdjustment(px(200, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0), { kind: "gaussianBlur", radius: 1 }));
    expect(blurred[4]).toBe(200);
  });
});
