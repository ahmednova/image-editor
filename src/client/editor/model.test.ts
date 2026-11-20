import { describe, expect, it } from "vitest";
import {
  commit, insertAbove, keepRatio, layerDefaults, moveLayer, nextLayerName,
  redo, removeLayer, undo, type Doc, type Layer,
} from "./model";

const raster = (name: string): Layer<string> => ({ ...layerDefaults(name), kind: "raster", canvas: name });
const doc = (...names: string[]): Doc<string> => ({ width: 10, height: 10, layers: names.map(raster) });
const names = (d: Doc<string>) => d.layers.map((l) => l.name);

describe("layer stack", () => {
  it("inserts above the selected layer and names new layers in order", () => {
    const d = doc("Background", "Layer 1");
    const added = insertAbove(d, d.layers[0]!.id, raster(nextLayerName(d)));
    expect(names(added)).toEqual(["Background", "Layer 2", "Layer 1"]);
  });
  it("reorders within bounds and never deletes the last layer", () => {
    const d = doc("A", "B", "C");
    expect(names(moveLayer(d, d.layers[0]!.id, 1)!)).toEqual(["B", "A", "C"]);
    expect(moveLayer(d, d.layers[2]!.id, 1)).toBeNull();
    const removed = removeLayer(d, d.layers[1]!.id)!;
    expect(names(removed.doc)).toEqual(["A", "C"]);
    expect(removed.selected).toBe(d.layers[0]!.id);
    expect(removeLayer(doc("Only"), doc("Only").layers[0]!.id)).toBeNull();
  });
});

describe("history", () => {
  it("walks steps back and forward, and a new step drops the redo list", () => {
    const a = doc("A");
    const b = doc("A", "B");
    const c = doc("C");
    let h = commit({ past: [], present: a, future: [] }, b);
    h = undo(h);
    expect(h.present).toBe(a);
    h = redo(h);
    expect(h.present).toBe(b);
    h = commit(undo(h), c);
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe(c);
  });
  it("keeps the ratio", () => {
    expect(keepRatio(640, 400, 320)).toBe(200);
  });
});
