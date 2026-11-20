// Authorization: private paths, private documents, admin-only actions, no sign-in of the app's own.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { bundle, createDocument, documentForm, listDocuments } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/api/documents", "/health"]);

  const ownerDoc = await createDocument(runtime, "owner", "Owner's quarterly cover");
  const memberDoc = await createDocument(runtime, "member", "Member's holiday card");
  const paths = (id) => [`/api/documents/${id}`, `/api/documents/${id}/data`, `/api/documents/${id}/thumbnail`, `/documents/${id}`, "/admin", "/api/admin/documents"];

  // Anonymous visitors and other organizations are refused everywhere.
  for (const role of [undefined, "outsider"]) {
    for (const path of paths(ownerDoc.id)) {
      const response = await runtime.fetch(path, { role });
      expect([401, 403, 404], `${role ?? "anonymous"} ${path}`).toContain(response.status);
      expect(await response.text()).not.toContain("quarterly cover");
    }
    const write = await runtime.fetch(`/api/documents/${ownerDoc.id}`, { role, method: "DELETE" });
    expect([401, 403, 404]).toContain(write.status);
  }

  // One member never reads or changes another's document.
  expect((await listDocuments(runtime, "member")).map((d) => d.id)).toEqual([memberDoc.id]);
  for (const path of paths(ownerDoc.id).slice(0, 3)) {
    const response = await runtime.fetch(path, { role: "member" });
    expect(response.status, path).toBe(404);
  }
  expect((await runtime.fetch(`/api/documents/${ownerDoc.id}/data`, {
    role: "member", method: "PUT", body: documentForm({ data: bundle(), version: 1 }),
  })).status).toBe(404);
  expect((await runtime.fetch(`/api/documents/${ownerDoc.id}`, {
    role: "member", method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Taken" }),
  })).status).toBe(404);
  expect((await runtime.fetch(`/api/documents/${ownerDoc.id}`, { role: "member", method: "DELETE" })).status).toBe(404);
  const intact = await listDocuments(runtime, "owner");
  expect(intact.find((d) => d.id === ownerDoc.id)).toMatchObject({ name: "Owner's quarterly cover", version: 1 });

  // Admin-only: the list of everyone's documents and deleting another's.
  expect((await runtime.fetch("/api/admin/documents", { role: "member" })).status).toBe(403);
  const all = await runtime.fetch("/api/admin/documents", { role: "owner" });
  expect(all.status).toBe(200);
  expect((await all.json()).map((d) => d.name)).toEqual(expect.arrayContaining(["Owner's quarterly cover", "Member's holiday card"]));
  expect((await runtime.fetch(`/api/documents/${memberDoc.id}/thumbnail`, { role: "owner" })).status).toBe(200);

  // In the browser: a member can't open the owner's document or the admin page.
  const memberContext = await runtime.context("member");
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/documents/${ownerDoc.id}`);
  await expect(memberPage.getByTestId("document-missing")).toBeVisible();
  await expect(memberPage.getByText("Owner's quarterly cover")).toHaveCount(0);
  await memberPage.goto("/admin");
  await expect(memberPage.getByTestId("admin-refused")).toBeVisible();
  await expect(memberPage.getByText("Owner's quarterly cover")).toHaveCount(0);
  await memberPage.goto("/");
  await expect(memberPage.getByRole("link", { name: "All documents" })).toHaveCount(0);

  // The admin sees and deletes the member's document from the admin page.
  const ownerContext = await runtime.context("owner");
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/");
  await ownerPage.getByRole("link", { name: "All documents" }).click();
  const row = ownerPage.getByTestId("admin-document").filter({ hasText: "Member's holiday card" });
  await expect(row).toBeVisible();
  await row.getByTestId("admin-delete").click();
  await ownerPage.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  expect(await listDocuments(runtime, "member")).toEqual([]);
  expect((await runtime.fetch(`/api/documents/${memberDoc.id}/data`, { role: "member" })).status).toBe(404);
  await memberContext.close();
  await ownerContext.close();

  // The app serves no sign-in page of its own.
  for (const path of ["/login", "/signin", "/signup", "/logout", "/auth/login"]) {
    for (const role of [undefined, "member"]) {
      const response = await runtime.fetch(path, { role });
      const body = await response.text();
      expect(response.status, `${path} ${role}`).not.toBe(200);
      expect(body).not.toMatch(/type="password"/i);
    }
  }
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
