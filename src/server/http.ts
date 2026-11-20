import { env } from "cloudflare:workers";
import { getEveryAppUser, isAdmin } from "@every-app/sdk/server";
import { documentBundle, documentName } from "@/shared/bundle";
import type { Upload, Viewer } from "@/server/documents";
import { ensureUser } from "@/server/users";

// Shared by the document routes: who is asking, and what they sent.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function viewerOf(request: Request): Promise<Viewer> {
  const user = await getEveryAppUser(request, env);
  if (!user) throw new HttpError(401, "Sign in through your Gateway.");
  await ensureUser(user);
  return { id: user.id, admin: isAdmin(user) };
}

const MAX_DATA_BYTES = 60 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];

export async function readUpload(form: FormData): Promise<Upload> {
  const data = form.get("data");
  const thumbnail = form.get("thumbnail");
  if (!(data instanceof File) || !(thumbnail instanceof File))
    throw new HttpError(400, "The document is missing.");
  if (data.size > MAX_DATA_BYTES)
    throw new HttpError(413, "The document is larger than 60 MB.");
  if (thumbnail.size > MAX_THUMBNAIL_BYTES)
    throw new HttpError(413, "The thumbnail is too large.");
  const text = await data.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "That isn't a document this app can read.");
  }
  const bundle = documentBundle.safeParse(parsed);
  if (!bundle.success)
    throw new HttpError(400, "That isn't a document this app can read.");
  const thumb = await thumbnail.arrayBuffer();
  const head = new Uint8Array(thumb.slice(0, 8));
  if (!PNG.every((byte, i) => head[i] === byte))
    throw new HttpError(400, "The thumbnail must be a PNG.");
  return { bundle: bundle.data, text, thumbnail: thumb };
}

export function readName(value: unknown): string {
  const name = documentName.safeParse(value);
  if (!name.success) throw new HttpError(400, "Give the document a name.");
  return name.data;
}

export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "Send the document as a form.");
  }
}

/** Runs a handler, turning HttpError into a JSON answer. */
export async function respond(
  work: () => Promise<Response>,
): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const notFound = () =>
  Response.json({ error: "No such document." }, { status: 404 });
