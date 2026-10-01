import type { Item } from "./data";

export default function ProductsRow(props: { item: Item }) {
  return (
    <div class="flex gap-2">
      <span class="font-semibold">{props.item.name}</span>
      <span>Precio: {props.item.amount}</span>
    </div>
  );
}
