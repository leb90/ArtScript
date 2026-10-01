import type { Item } from "./data";

export default function BranchesRow(props: { item: Item }) {
  return (
    <div class="flex gap-2">
      <span class="font-semibold">{props.item.name}</span>
      <span>Ventas: {props.item.amount}</span>
    </div>
  );
}
