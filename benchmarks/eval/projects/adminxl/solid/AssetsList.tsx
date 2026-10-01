import { For, Show } from "solid-js";
import type { Item } from "./data";
import AssetsRow from "./AssetsRow";

export default function AssetsList(props: { items: Item[] }) {
  return (
    <Show when={props.items.length > 0} fallback={<span class="text-gray-500">Sin registros</span>}>
      <div class="flex flex-col gap-1">
        <For each={props.items}>{(item) => <AssetsRow item={item} />}</For>
      </div>
    </Show>
  );
}
