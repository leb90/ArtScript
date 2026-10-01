import { For, Show } from "solid-js";
import type { Item } from "./data";
import SuppliersRow from "./SuppliersRow";

export default function SuppliersList(props: { items: Item[] }) {
  return (
    <Show when={props.items.length > 0} fallback={<span class="text-gray-500">Sin registros</span>}>
      <div class="flex flex-col gap-1">
        <For each={props.items}>{(item) => <SuppliersRow item={item} />}</For>
      </div>
    </Show>
  );
}
