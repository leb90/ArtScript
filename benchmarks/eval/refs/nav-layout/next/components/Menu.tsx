"use client";

import Link from "next/link";
import { useState } from "react";

export default function Menu() {
  const [likes, setLikes] = useState(0);
  return (
    <nav>
      <Link href="/">Inicio</Link> <Link href="/equipo">Equipo</Link>
      <button onClick={() => setLikes(likes + 1)}>Me gusta</button>
      <span>Likes: {likes}</span>
    </nav>
  );
}
