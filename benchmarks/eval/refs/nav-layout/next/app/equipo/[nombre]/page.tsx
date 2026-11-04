"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function Page() {
  const { nombre } = useParams<{ nombre: string }>();
  return (
    <main>
      <h1>Perfil de {nombre}</h1>
      <Link href="/equipo">Volver al equipo</Link>
    </main>
  );
}
