import type { Product } from "./data";

export default function ProductCard(props: { product: Product; onAdd: () => void }) {
  return (
    <div class="flex flex-col gap-1 rounded border p-2">
      <span class="font-semibold">{props.product.name}</span>
      <span>${props.product.price.toFixed(2)}</span>
      <button class="primary" onClick={props.onAdd}>Agregar</button>
    </div>
  );
}
