import { cookies } from "next/headers";
import { db } from "@/lib/db";

export async function POST() {
  const store = await cookies();
  db.sessions.delete(store.get("session")?.value ?? "");
  store.delete("session");
  return Response.json({ ok: true });
}
