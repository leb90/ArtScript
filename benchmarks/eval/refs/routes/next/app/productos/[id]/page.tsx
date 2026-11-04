import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS } from "@/lib/products";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) notFound();
  return (
    <main>
      <h1>{product.name}</h1>
      <Link href="/">Volver</Link>
    </main>
  );
}
