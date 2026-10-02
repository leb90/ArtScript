import { useState } from "react";

function Note({ text, onSave }: { text: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  function edit() {
    setDraft(text);
    setEditing(true);
  }

  function save() {
    onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={save}>Guardar</button>
        <button onClick={() => setEditing(false)}>Cancelar</button>
      </li>
    );
  }
  return (
    <li className="flex gap-2">
      <span>{text}</span>
      <button onClick={edit}>Editar</button>
    </li>
  );
}

export default function App() {
  const [notes, setNotes] = useState(["Comprar pan", "Llamar a Ana", "Pagar luz"]);
  const [edited, setEdited] = useState(0);

  function save(index: number, text: string) {
    setNotes(notes.map((n, i) => (i === index ? text : n)));
    setEdited(edited + 1);
  }

  return (
    <div className="flex flex-col gap-2">
      <ul>
        {notes.map((n, i) => <Note key={i} text={n} onSave={(text) => save(i, text)} />)}
      </ul>
      <p>Editadas: {edited}</p>
    </div>
  );
}
