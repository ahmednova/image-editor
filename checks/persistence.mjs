// Persistence: saved documents survive a restart of the Workers.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { bundle, createDocument, documentForm, listDocuments } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const doc = await createDocument(runtime, "member", "Garden journal cover");
  const saved = await runtime.fetch(`/api/documents/${doc.id}/data`, {
    role: "member", method: "PUT", body: documentForm({ data: bundle({ width: 150, height: 90 }), version: 1 }),
  });
  expect(saved.status).toBe(200);

  await runtime.restart();

  const [listed] = await listDocuments(runtime, "member");
  expect(listed).toMatchObject({ id: doc.id, name: "Garden journal cover", width: 150, height: 90, version: 2 });
  const data = await (await runtime.fetch(`/api/documents/${doc.id}/data`, { role: "member" })).json();
  expect(data.layers.map((l) => [l.name, l.opacity, l.blend])).toEqual([["Background", 100, "normal"], ["Caption", 80, "multiply"]]);

  const context = await runtime.context("member");
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("document-card")).toHaveCount(1);
  await expect(page.getByTestId("document-card")).toContainText("150 × 90 px");
  await page.getByRole("link", { name: "Garden journal cover" }).click();
  await expect.poll(() => page.getByTestId("layer-row").evaluateAll((els) => els.map((el) => el.dataset.name)))
    .toEqual(["Caption", "Background"]);
  await context.close();
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
