import { randomUUID } from "node:crypto";
import { users } from "@/lib/db";

export async function GET() {
  return Response.json(users);
}

export async function POST(request: Request) {
  const { name, email } = await request.json();
  if (typeof email !== "string" || !email.includes("@")) return Response.json({ error: "Email inválido" }, { status: 400 });
  const user = { id: randomUUID(), name: String(name), email };
  users.push(user);
  return Response.json(user, { status: 201 });
}
