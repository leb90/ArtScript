import { randomUUID } from "node:crypto";
import { currentUser, db } from "@/lib/db";

export async function GET() {
  const me = await currentUser();
  if (!me) return Response.json({ error: "login required" }, { status: 401 });
  return Response.json(db.notes.filter((n) => n.owner === me.id));
}

export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "login required" }, { status: 401 });
  const { text } = await request.json();
  if (typeof text !== "string") return Response.json({ error: "text required" }, { status: 400 });
  const note = { id: randomUUID(), owner: me.id, text };
  db.notes.push(note);
  return Response.json(note, { status: 201 });
}
