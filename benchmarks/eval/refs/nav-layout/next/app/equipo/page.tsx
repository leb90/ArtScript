import Link from "next/link";

export default function Page() {
  return (
    <main>
      <h1>Nuestro equipo</h1>
      <Link href="/equipo/ana">Ana</Link> <Link href="/equipo/beto">Beto</Link>
    </main>
  );
}
