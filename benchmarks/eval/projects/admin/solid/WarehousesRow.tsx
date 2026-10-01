import type { Item } from "./data";

export default function WarehousesRow(props: { item: Item }) {
  return (
    <div class="flex gap-2">
      <span class="font-semibold">{props.item.name}</span>
      <span>Capacidad: {props.item.amount}</span>
    </div>
  );
}
