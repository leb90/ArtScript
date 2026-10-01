import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import InvoicesForm from "./InvoicesForm";
import InvoicesList from "./InvoicesList";

export default function InvoicesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Facturas</h2>
      <InvoicesForm onAdd={add} />
      <InvoicesList items={items()} />
    </div>
  );
}
