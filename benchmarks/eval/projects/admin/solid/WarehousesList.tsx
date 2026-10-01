import { For, Show } from "solid-js";
import type { Item } from "./data";
import WarehousesRow from "./WarehousesRow";

export default function WarehousesList(props: { items: Item[] }) {
  return (
    <Show when={props.items.length > 0} fallback={<span class="text-gray-500">Sin registros</span>}>
      <div class="flex flex-col gap-1">
        <For each={props.items}>{(item) => <WarehousesRow item={item} />}</For>
      </div>
    </Show>
  );
}
