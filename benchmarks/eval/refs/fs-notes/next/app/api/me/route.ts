import { currentUser } from "@/lib/db";

export async function GET() {
  const me = await currentUser();
  return Response.json(me ? { email: me.email } : null);
}
