import type { Product } from "./data";

export default function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded border p-2">
      <span className="font-semibold">{product.name}</span>
      <span>${product.price.toFixed(2)}</span>
      <button className="primary" onClick={onAdd}>Agregar</button>
    </div>
  );
}
