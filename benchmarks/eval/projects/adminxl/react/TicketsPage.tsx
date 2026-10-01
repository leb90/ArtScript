import { useState } from "react";
import { SEED, type Item } from "./data";
import TicketsForm from "./TicketsForm";
import TicketsList from "./TicketsList";

export default function TicketsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Tickets</h2>
      <TicketsForm onAdd={add} />
      <TicketsList items={items} />
    </div>
  );
}
