import { createUser, db, startSession } from "@/lib/db";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (typeof email !== "string" || typeof password !== "string" || !email.includes("@") || password.length < 8) return Response.json({ error: "invalid" }, { status: 400 });
  if (db.users.some((u) => u.email === email)) return Response.json({ error: "exists" }, { status: 409 });
  const user = createUser(email, password);
  await startSession(user);
  return Response.json({ email: user.email });
}
