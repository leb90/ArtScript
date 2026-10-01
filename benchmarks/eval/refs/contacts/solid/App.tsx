import { createSignal, For, Show } from "solid-js";

type Contact = { name: string; kind: string };

export default function App() {
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [kind, setKind] = createSignal("Amigo");

  function save() {
    setContacts([...contacts(), { name: name(), kind: kind() }]);
    setName("");
    setOpen(false);
  }

  return (
    <div class="flex flex-col gap-3">
      <button onClick={() => setOpen(true)}>Nuevo contacto</button>
      <For each={contacts()}>{(c) => <p>{c.name} ({c.kind})</p>}</For>
      <Show when={open()}>
        <div role="dialog" class="fixed inset-0 flex items-center justify-center bg-black/40">
          <div class="flex flex-col gap-2 rounded bg-white p-4">
            <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            <select value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
              <option>Amigo</option>
              <option>Trabajo</option>
            </select>
            <div class="flex gap-2">
              <button onClick={save}>Guardar</button>
              <button onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
