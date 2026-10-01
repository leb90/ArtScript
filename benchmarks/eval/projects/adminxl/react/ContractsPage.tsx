import { useState } from "react";
import { SEED, type Item } from "./data";
import ContractsForm from "./ContractsForm";
import ContractsList from "./ContractsList";

export default function ContractsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Contratos</h2>
      <ContractsForm onAdd={add} />
      <ContractsList items={items} />
    </div>
  );
}
