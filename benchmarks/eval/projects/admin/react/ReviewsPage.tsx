import { useState } from "react";
import { SEED, type Item } from "./data";
import ReviewsForm from "./ReviewsForm";
import ReviewsList from "./ReviewsList";

export default function ReviewsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Reseñas</h2>
      <ReviewsForm onAdd={add} />
      <ReviewsList items={items} />
    </div>
  );
}
