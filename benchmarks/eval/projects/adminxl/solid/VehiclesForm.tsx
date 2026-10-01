import { createSignal } from "solid-js";

export default function VehiclesForm(props: { onAdd: (name: string, amount: number) => void }) {
  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");

  function submit() {
    props.onAdd(name(), Number(amount()) || 0);
    setName("");
    setAmount("");
  }

  return (
    <div class="flex gap-2">
      <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      <input placeholder="Kilometraje" type="number" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
      <button class="primary" onClick={submit}>Agregar</button>
    </div>
  );
}
