import { db } from "@/db";
import { users } from "@/db/schema";

/** Records the member on first sight; keeps their email current. */
export async function ensureUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, createdAt: Date.now() })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}
