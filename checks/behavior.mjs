// Behavior: every frozen feature's main path, through the API and the editor.
import { readFile } from "node:fs/promises";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import {
  bundle, createDocument, documentForm, listDocuments, makePng, pngSize,
} from "./lib.mjs";

const runtime = await startRuntime();

const rows = (page) =>
  page.getByTestId("layer-row").evaluateAll((els) =>
    els.map((el) => ({ name: el.dataset.name, kind: el.dataset.kind, selected: el.dataset.selected === "true" })));
const names = async (page) => (await rows(page)).map((row) => row.name);

/** The composite's pixel at a fraction of the canvas. */
const pixel = (page, fx, fy) =>
  page.getByTestId("editor-canvas").evaluate((canvas, [fx, fy]) => {
    const x = Math.min(canvas.width - 1, Math.floor(canvas.width * fx));
    const y = Math.min(canvas.height - 1, Math.floor(canvas.height * fy));
    return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
  }, [fx, fy]);

async function at(page, fx, fy) {
  const box = await page.getByTestId("editor-canvas").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}
async function drag(page, from, to) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
async function clickCanvas(page, fx, fy) {
  const p = await at(page, fx, fy);
  await page.mouse.click(p.x, p.y);
}
const isBlue = (px) => px[2] > 150 && px[0] < 120;
const isWhite = (px) => px[0] > 240 && px[1] > 240 && px[2] > 240;

async function menu(page, trigger, item) {
  await page.getByTestId(trigger).click();
  await page.getByRole("menuitem", { name: item }).click();
}

try {
  // ---- Request level: create, read, save with versions, rename, delete (F001, F005, F006)
  const first = await createDocument(runtime, "owner", "Harbor sunset");
  expect(first).toMatchObject({ name: "Harbor sunset", width: 120, height: 80, version: 1 });
  const second = await createDocument(runtime, "owner", "Street portrait", bundle({ width: 64, height: 48 }));
  let list = await listDocuments(runtime, "owner");
  expect(list.map((d) => d.name).slice(0, 2)).toEqual(["Street portrait", "Harbor sunset"]);
  expect(list[0]).toMatchObject({ width: 64, height: 48 });

  const corrupt = await runtime.fetch("/api/documents", {
    role: "owner", method: "POST", body: documentForm({ name: "Broken", data: "not a document" }),
  });
  expect(corrupt.status).toBe(400);
  expect((await listDocuments(runtime, "owner")).length).toBe(list.length);

  const data = await runtime.fetch(`/api/documents/${first.id}/data`, { role: "owner" });
  expect(data.status).toBe(200);
  const stored = await data.json();
  expect(stored.layers.map((l) => l.name)).toEqual(["Background", "Caption"]);
  expect(stored.layers[1]).toMatchObject({ opacity: 80, blend: "multiply", lockPosition: true, text: { content: "Morning market" } });

  const saved = await runtime.fetch(`/api/documents/${first.id}/data`, {
    role: "owner", method: "PUT", body: documentForm({ data: bundle({ width: 100, height: 50 }), version: 1 }),
  });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ version: 2, width: 100, height: 50 });
  const stale = await runtime.fetch(`/api/documents/${first.id}/data`, {
    role: "owner", method: "PUT", body: documentForm({ data: bundle(), version: 1 }),
  });
  expect(stale.status).toBe(409);

  const thumb = await runtime.fetch(`/api/documents/${first.id}/thumbnail`, { role: "owner" });
  expect(thumb.status).toBe(200);
  expect(thumb.headers.get("content-type")).toContain("image/png");

  const renamed = await runtime.fetch(`/api/documents/${second.id}`, {
    role: "owner", method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Street portrait, final" }),
  });
  expect(renamed.status).toBe(200);
  expect((await listDocuments(runtime, "owner")).map((d) => d.name)).toContain("Street portrait, final");
  expect((await runtime.fetch(`/api/documents/${second.id}`, { role: "owner", method: "DELETE" })).status).toBe(204);
  expect((await runtime.fetch(`/api/documents/${second.id}/data`, { role: "owner" })).status).toBe(404);

  // ---- Browser journey as a member
  const context = await runtime.context("member", { acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("library-empty")).toBeVisible();

  // Unsupported and corrupt files create nothing.
  await page.getByTestId("open-file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("open-error")).toBeVisible();
  await page.getByTestId("open-file-input").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await expect(page.getByTestId("open-error")).toBeVisible();
  await expect(page.getByTestId("document-card")).toHaveCount(0);

  // F001: a blank document.
  await page.getByTestId("new-document").click();
  await page.getByTestId("new-name").fill("Lighthouse poster");
  await page.getByTestId("new-width").fill("640");
  await page.getByTestId("new-height").fill("400");
  await page.getByTestId("bg-white").click();
  await Promise.all([page.waitForURL(/\/documents\/[\w-]+$/), page.getByTestId("create-document").click()]);
  const posterUrl = page.url();
  await expect(page.getByTestId("document-size")).toHaveText("640 × 400 px");
  await expect(page.getByTestId("layer-row")).toHaveCount(1);
  expect(isWhite(await pixel(page, 0.5, 0.5))).toBe(true);

  // F002 + F003: a new layer, then a brush stroke on it, with undo and redo.
  await page.getByTestId("add-layer").click();
  await expect(page.getByTestId("layer-row")).toHaveCount(2);
  expect((await rows(page))[0].selected).toBe(true);
  await page.getByTestId("tool-brush").click();
  await page.getByTestId("brush-size").fill("40");
  await page.getByTestId("brush-color").fill("#1d4ed8");
  await drag(page, [0.3, 0.5], [0.7, 0.5]);
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isBlue)).toBe(true);
  await expect(page.getByTestId("unsaved")).toBeVisible();
  await page.getByTestId("undo").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isWhite)).toBe(true);
  await page.getByTestId("redo").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isBlue)).toBe(true);

  // Eraser back to transparency shows the white layer below.
  await page.getByTestId("tool-eraser").click();
  await drag(page, [0.68, 0.5], [0.72, 0.5]);
  await expect.poll(() => pixel(page, 0.7, 0.5).then(isWhite)).toBe(true);
  expect(isBlue(await pixel(page, 0.5, 0.5))).toBe(true);

  // Locked pixels refuse painting.
  await page.getByTestId("lock-pixels").click();
  await page.getByTestId("tool-brush").click();
  await drag(page, [0.5, 0.2], [0.5, 0.3]);
  await expect(page.getByText("This layer's pixels are locked")).toBeVisible();
  expect(isWhite(await pixel(page, 0.5, 0.25))).toBe(true);
  await page.getByTestId("lock-pixels").click();

  // F004: invert previews live, Cancel restores, Apply commits one undoable step.
  await menu(page, "adjust-menu", "Invert");
  await expect(page.getByTestId("adjust-dialog")).toBeVisible();
  await expect.poll(() => pixel(page, 0.5, 0.5).then((px) => px[0] > 180 && px[2] < 100)).toBe(true);
  await page.getByTestId("adjust-cancel").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isBlue)).toBe(true);
  await menu(page, "adjust-menu", "Hue/Saturation");
  await page.getByTestId("adjust-saturation").fill("-100");
  await expect.poll(() => pixel(page, 0.5, 0.5).then((px) => Math.abs(px[0] - px[2]) < 12)).toBe(true);
  await page.getByTestId("adjust-apply").click();
  await expect(page.getByTestId("adjust-dialog")).toBeHidden();
  await page.getByTestId("undo").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isBlue)).toBe(true);
  await menu(page, "adjust-menu", "Gaussian blur");
  await page.getByTestId("adjust-radius").fill("6");
  await page.getByTestId("adjust-apply").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isBlue)).toBe(true);

  // F002: opacity, blend mode, rename, duplicate, reorder, visibility, delete, merge down.
  await page.getByTestId("layer-opacity").fill("50");
  await page.getByTestId("layer-opacity").press("Enter");
  await expect.poll(() => pixel(page, 0.5, 0.5).then((px) => px[0] > 90 && px[0] < 200 && px[2] > 200)).toBe(true);
  await page.getByTestId("layer-blend").click();
  await page.getByRole("option", { name: "Multiply" }).click();
  await expect(page.getByTestId("layer-blend")).toContainText("Multiply");
  await page.getByTestId("rename-layer").click();
  await page.getByTestId("layer-name-input").fill("Beam");
  await page.getByTestId("layer-name-save").click();
  expect(await names(page)).toEqual(["Beam", "Background"]);
  await page.getByTestId("duplicate-layer").click();
  expect(await names(page)).toEqual(["Beam copy", "Beam", "Background"]);
  await page.getByTestId("layer-down").click();
  expect(await names(page)).toEqual(["Beam", "Beam copy", "Background"]);
  await page.getByTestId("layer-up").click();
  expect(await names(page)).toEqual(["Beam copy", "Beam", "Background"]);
  await page.getByTestId("delete-layer").click();
  expect(await names(page)).toEqual(["Beam", "Background"]);
  await page.getByTestId("layer-row").nth(0).getByTestId("layer-visibility").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isWhite)).toBe(true);
  await page.getByTestId("layer-row").nth(0).getByTestId("layer-visibility").click();
  await expect.poll(() => pixel(page, 0.5, 0.5).then(isWhite)).toBe(false);

  // Move, and a locked position refuses it.
  await page.getByTestId("tool-move").click();
  await drag(page, [0.5, 0.5], [0.5, 0.8]);
  await expect.poll(() => pixel(page, 0.5, 0.8).then((px) => !isWhite(px))).toBe(true);
  await page.getByTestId("lock-position").click();
  await drag(page, [0.5, 0.8], [0.5, 0.2]);
  await expect(page.getByText("This layer's position is locked")).toBeVisible();
  await page.getByTestId("lock-position").click();

  // F003: a text layer that stays editable until rasterized.
  await page.getByTestId("tool-text").click();
  await clickCanvas(page, 0.1, 0.15);
  await page.getByTestId("text-content").fill("Open late");
  await page.getByTestId("text-size").fill("56");
  await page.getByTestId("text-color").fill("#b91c1c");
  await page.getByTestId("text-save").click();
  await expect.poll(() => rows(page).then((r) => r[0])).toMatchObject({ name: "Open late", kind: "text", selected: true });
  await page.getByTestId("tool-brush").click();
  await drag(page, [0.2, 0.9], [0.3, 0.9]);
  await expect(page.getByText("Rasterize the text layer first")).toBeVisible();
  await page.getByTestId("edit-text").click();
  await page.getByTestId("text-content").fill("Open late tonight");
  await page.getByTestId("text-save").click();
  await expect(page.getByTestId("layer-row").first()).toHaveAttribute("data-name", "Open late tonight");
  await page.getByTestId("rasterize-layer").click();
  await expect(page.getByTestId("layer-row").first()).toHaveAttribute("data-kind", "raster");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-row").first()).toHaveAttribute("data-kind", "text");

  // Merge down folds the selected layer into the one below.
  await page.getByTestId("layer-row").nth(1).click();
  await page.getByTestId("merge-down").click();
  expect(await names(page)).toEqual(["Open late tonight", "Background"]);

  // Canvas: rotate, flip, resize keeping the aspect ratio, crop.
  await menu(page, "image-menu", "Rotate 90° clockwise");
  await expect(page.getByTestId("document-size")).toHaveText("400 × 640 px");
  await menu(page, "image-menu", "Flip horizontal");
  await menu(page, "image-menu", "Image size");
  await page.getByTestId("resize-width").fill("200");
  await expect(page.getByTestId("resize-height")).toHaveValue("320");
  await page.getByTestId("resize-apply").click();
  await expect(page.getByTestId("document-size")).toHaveText("200 × 320 px");
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("document-size")).toHaveText("640 × 400 px");
  await page.getByTestId("tool-crop").click();
  await drag(page, [0, 0], [0.5, 0.5]);
  await page.getByTestId("crop-apply").click();
  await expect(page.getByTestId("document-size")).toHaveText(/^3[12]\d × 2\d\d px$/);
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("document-size")).toHaveText("640 × 400 px");

  // F001: dropping and pasting an image adds a layer.
  const badge = makePng(80, 80, () => [250, 180, 30, 255]);
  const sendImage = (type, name) =>
    page.getByTestId("editor-stage").evaluate((stage, [type, name, bytes]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
      if (type === "drop") stage.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
      else document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, [type, name, [...badge]]);
  await page.getByTestId("layer-row").nth(0).click();
  await sendImage("drop", "badge.png");
  await expect.poll(() => names(page)).toEqual(["badge", "Open late tonight", "Background"]);
  await sendImage("paste", "sticker.png");
  await expect.poll(() => names(page)).toEqual(["sticker", "badge", "Open late tonight", "Background"]);
  await page.getByTestId("delete-layer").click();

  // F005: save, reload, everything as left.
  await page.getByTestId("layer-row").nth(1).click();
  await page.getByTestId("layer-opacity").fill("70");
  await page.getByTestId("layer-opacity").press("Enter");
  await page.getByTestId("lock-position").click();
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toBeHidden();
  await page.reload();
  await expect.poll(() => rows(page)).toEqual([
    { name: "badge", kind: "raster", selected: true },
    { name: "Open late tonight", kind: "text", selected: false },
    { name: "Background", kind: "raster", selected: false },
  ]);
  await page.getByTestId("layer-row").nth(1).click();
  await expect(page.getByTestId("layer-opacity")).toHaveValue("70");
  await expect(page.getByTestId("lock-position")).toBeChecked();
  await expect(page.getByTestId("unsaved")).toBeHidden();

  // A save from a stale copy is refused.
  const other = await context.newPage();
  await other.goto(posterUrl);
  await expect(other.getByTestId("layer-row")).toHaveCount(3);
  await page.getByTestId("layer-row").nth(0).getByTestId("layer-visibility").click();
  await page.getByTestId("save").click();
  await expect(page.getByTestId("unsaved")).toBeHidden();
  await other.getByTestId("add-layer").click();
  await other.getByTestId("save").click();
  await expect(other.getByTestId("save-error")).toBeVisible();
  await expect(other.getByTestId("unsaved")).toBeVisible();
  await other.close();
  await page.getByTestId("layer-row").nth(0).getByTestId("layer-visibility").click();

  // Export: JPG with quality, PNG at a chosen size, layered PSD.
  await page.getByTestId("export").click();
  await page.getByTestId("export-jpg").click();
  await page.getByTestId("export-quality").fill("80");
  let [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  expect(download.suggestedFilename()).toBe("Lighthouse poster.jpg");
  const jpg = await readFile(await download.path());
  expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
  await page.getByTestId("export").click();
  await page.getByTestId("export-png").click();
  await page.getByTestId("export-width").fill("320");
  await expect(page.getByTestId("export-height")).toHaveValue("200");
  [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  expect(download.suggestedFilename()).toBe("Lighthouse poster.png");
  expect(pngSize(await readFile(await download.path()))).toEqual({ width: 320, height: 200 });
  await page.getByTestId("export").click();
  await page.getByTestId("export-webp").click();
  [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  expect((await readFile(await download.path())).subarray(8, 12).toString()).toBe("WEBP");
  [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("save-psd").click()]);
  expect(download.suggestedFilename()).toBe("Lighthouse poster.psd");
  const psdPath = await download.path();
  expect((await readFile(psdPath)).subarray(0, 4).toString()).toBe("8BPS");

  // F001 + F006: the PSD opens as a new layered document; the library lists both.
  await page.goto("/");
  await expect(page.getByTestId("document-card")).toHaveCount(1);
  await Promise.all([
    page.waitForURL(/\/documents\/[\w-]+$/),
    page.getByTestId("open-file-input").setInputFiles({ name: "Poster layers.psd", mimeType: "image/vnd.adobe.photoshop", buffer: await readFile(psdPath) }),
  ]);
  await expect.poll(() => names(page)).toEqual(["badge", "Open late tonight", "Background"]);
  await expect(page.getByTestId("document-size")).toHaveText("640 × 400 px");
  await page.getByTestId("layer-row").nth(1).click();
  await expect(page.getByTestId("layer-opacity")).toHaveValue("70");

  // An image file opens as a document named after it.
  await page.goto("/");
  await Promise.all([
    page.waitForURL(/\/documents\/[\w-]+$/),
    page.getByTestId("open-file-input").setInputFiles({ name: "Shop sign.png", mimeType: "image/png", buffer: makePng(90, 60, (x) => [x * 2, 120, 200, 255]) }),
  ]);
  await expect(page.getByTestId("document-size")).toHaveText("90 × 60 px");
  await expect(page.getByRole("heading", { name: "Shop sign" })).toBeVisible();

  await page.goto("/");
  const cards = page.getByTestId("document-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Shop sign");
  await expect(cards.first()).toContainText("90 × 60 px");
  await expect(cards.first().locator("img")).toBeVisible();
  await cards.first().getByTestId("document-actions").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByTestId("document-name-input").fill("Shop sign, cropped");
  await page.getByTestId("document-name-save").click();
  await expect(cards.first()).toContainText("Shop sign, cropped");
  await cards.first().getByTestId("document-actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Shop sign, cropped")).toHaveCount(0);

  // The public picture: the poster open in the editor.
  await Promise.all([page.waitForURL(posterUrl), page.getByRole("link", { name: "Lighthouse poster" }).click()]);
  await expect(page.getByTestId("layer-row")).toHaveCount(3);
  const harbor = makePng(640, 400, (x, y) => {
    if ((x - 450) ** 2 + (y - 235) ** 2 < 55 ** 2 && y < 262) return [255, 236, 190, 255];
    if (y < 262) return [255, 140 + Math.round(y / 4), 90 + Math.round(y / 5), 255];
    const ripple = (y + Math.round(6 * Math.sin(x / 9))) % 14 < 3 ? 30 : 0;
    return [30 + ripple, 60 + ripple, 105 + ripple, 255];
  });
  await page.getByTestId("layer-row").nth(2).click();
  await page.getByTestId("editor-stage").evaluate((stage, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "Harbor at dusk.png", { type: "image/png" }));
    stage.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, [...harbor]);
  await expect.poll(() => names(page)).toEqual(["badge", "Open late tonight", "Harbor at dusk", "Background"]);
  await runtime.screenshot(page);
  await context.close();

  // Phone-sized smoke.
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  await small.goto("/");
  await expect(small.getByTestId("new-document")).toBeVisible();
  await expect(small.getByTestId("document-card")).toHaveCount(2);
  await small.goto(posterUrl);
  await expect(small.getByTestId("editor-canvas")).toBeVisible();
  await expect(small.getByTestId("save")).toBeVisible();
  await phone.close();
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
