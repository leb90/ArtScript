import { createSignal, For, Show } from "solid-js";

function Note(props: { initial: string; onSaved: () => void }) {
  const [text, setText] = createSignal(props.initial);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  function edit() {
    setDraft(text());
    setEditing(true);
  }
  function save() {
    setText(draft());
    setEditing(false);
    props.onSaved();
  }

  return (
    <li class="flex gap-2">
      <Show
        when={editing()}
        fallback={
          <>
            <span>{text()}</span>
            <button onClick={edit}>Editar</button>
          </>
        }
      >
        <input value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
        <button onClick={save}>Guardar</button>
        <button onClick={() => setEditing(false)}>Cancelar</button>
      </Show>
    </li>
  );
}

export default function App() {
  const [edited, setEdited] = createSignal(0);

  return (
    <div class="flex flex-col gap-2">
      <ul>
        <For each={["Comprar pan", "Llamar a Ana", "Pagar luz"]}>
          {(note) => <Note initial={note} onSaved={() => setEdited(edited() + 1)} />}
        </For>
      </ul>
      <p>Editadas: {edited()}</p>
    </div>
  );
}
