import { getPhoto } from "@/lib/db";

export async function GET() {
  const photo = getPhoto();
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.data), { headers: { "content-type": photo.type } });
}
