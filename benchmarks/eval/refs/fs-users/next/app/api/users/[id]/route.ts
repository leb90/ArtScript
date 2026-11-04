import { users } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const at = users.findIndex((u) => u.id === id);
  if (at >= 0) users.splice(at, 1);
  return new Response(null, { status: 204 });
}
