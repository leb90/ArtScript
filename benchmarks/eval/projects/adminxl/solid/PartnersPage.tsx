import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import PartnersForm from "./PartnersForm";
import PartnersList from "./PartnersList";

export default function PartnersPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Socios</h2>
      <PartnersForm onAdd={add} />
      <PartnersList items={items()} />
    </div>
  );
}
