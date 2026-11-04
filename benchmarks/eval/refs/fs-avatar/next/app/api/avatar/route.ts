import { getPhoto, setPhoto } from "@/lib/db";

export async function POST(request: Request) {
  const { type, data } = await request.json();
  setPhoto(String(type), Buffer.from(String(data), "base64"));
  return new Response(null, { status: 204 });
}

export async function GET() {
  const photo = getPhoto();
  return Response.json(photo ? { url: `/api/avatar/raw?v=${photo.version}` } : null);
}
