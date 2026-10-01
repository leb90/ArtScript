import { useState } from "react";

type Contact = { name: string; kind: string };

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Amigo");

  function save() {
    setContacts([...contacts, { name, kind }]);
    setName("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setOpen(true)}>Nuevo contacto</button>
      {contacts.map((c, i) => <p key={i}>{c.name} ({c.kind})</p>)}
      {open && (
        <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="flex flex-col gap-2 rounded bg-white p-4">
            <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option>Amigo</option>
              <option>Trabajo</option>
            </select>
            <div className="flex gap-2">
              <button onClick={save}>Guardar</button>
              <button onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
