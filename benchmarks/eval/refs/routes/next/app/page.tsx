import Link from "next/link";
import { PRODUCTS } from "@/lib/products";

export default function Page() {
  return (
    <main>
      <h1>Productos</h1>
      {PRODUCTS.map((p) => (
        <div key={p.id}>
          <span>{p.name}</span> <Link href={`/productos/${p.id}`}>Ver</Link>
        </div>
      ))}
    </main>
  );
}
