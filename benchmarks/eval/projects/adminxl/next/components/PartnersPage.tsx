import { useState } from "react";
import { SEED, type Item } from "@/lib/data";
import PartnersForm from "@/components/PartnersForm";
import PartnersList from "@/components/PartnersList";

export default function PartnersPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Socios</h2>
      <PartnersForm onAdd={add} />
      <PartnersList items={items} />
    </div>
  );
}
