import { useState } from "react";

const items = Array.from({ length: 23 }, (_, i) => `Ítem ${i + 1}`);
const PAGE = 10;
const pages = Math.ceil(items.length / PAGE);

export default function App() {
  const [page, setPage] = useState(1);
  const visible = items.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="flex flex-col gap-2">
      <ul>
        {visible.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p>Página {page} de {pages}</p>
      <div className="flex gap-2">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
        <button disabled={page === pages} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
