import { useState } from "react";

export default function ShipmentsForm({ onAdd }: { onAdd: (name: string, amount: number) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    onAdd(name, Number(amount) || 0);
    setName("");
    setAmount("");
  }

  return (
    <div className="flex gap-2">
      <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Costo" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button className="primary" onClick={submit}>Agregar</button>
    </div>
  );
}
