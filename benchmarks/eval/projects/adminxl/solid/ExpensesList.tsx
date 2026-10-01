import { For, Show } from "solid-js";
import type { Item } from "./data";
import ExpensesRow from "./ExpensesRow";

export default function ExpensesList(props: { items: Item[] }) {
  return (
    <Show when={props.items.length > 0} fallback={<span class="text-gray-500">Sin registros</span>}>
      <div class="flex flex-col gap-1">
        <For each={props.items}>{(item) => <ExpensesRow item={item} />}</For>
      </div>
    </Show>
  );
}
