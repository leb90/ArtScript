import { checkPassword, db, startSession } from "@/lib/db";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const user = db.users.find((u) => u.email === email);
  if (!user || typeof password !== "string" || !checkPassword(user, password)) return Response.json({ error: "invalid" }, { status: 401 });
  await startSession(user);
  return Response.json({ email: user.email });
}
