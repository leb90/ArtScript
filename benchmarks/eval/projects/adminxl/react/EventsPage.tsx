import { useState } from "react";
import { SEED, type Item } from "./data";
import EventsForm from "./EventsForm";
import EventsList from "./EventsList";

export default function EventsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Eventos</h2>
      <EventsForm onAdd={add} />
      <EventsList items={items} />
    </div>
  );
}
