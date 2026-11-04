"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRODUCTS = ["Mesa", "Silla", "Sillón", "Lámpara"];

export default function Search() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const found = PRODUCTS.filter((p) => p.toLowerCase().includes(q.toLowerCase()));
  return (
    <main>
      <input placeholder="Buscar" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={() => router.push(`/?q=${encodeURIComponent(draft)}`)}>Buscar</button>
      <p>Resultados: {found.length}</p>
      <ul>{found.map((p) => <li key={p}>{p}</li>)}</ul>
    </main>
  );
}
