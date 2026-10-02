import { useEffect, useState, type MouseEvent } from "react";

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [likes, setLikes] = useState(0);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (to: string) => (e: MouseEvent) => {
    e.preventDefault();
    history.pushState(null, "", to);
    setPath(to);
  };

  const profile = path.match(/^\/equipo\/([^/]+)$/);

  return (
    <div>
      <nav className="flex gap-3">
        <a href="/" onClick={go("/")}>Inicio</a>
        <a href="/equipo" onClick={go("/equipo")}>Equipo</a>
        <button onClick={() => setLikes(likes + 1)}>Me gusta</button>
        <span>Likes: {likes}</span>
      </nav>
      {path === "/" ? (
        <h1>Bienvenido</h1>
      ) : path === "/equipo" ? (
        <div className="flex flex-col gap-2">
          <h1>Nuestro equipo</h1>
          <a href="/equipo/ana" onClick={go("/equipo/ana")}>Ana</a>
          <a href="/equipo/beto" onClick={go("/equipo/beto")}>Beto</a>
        </div>
      ) : profile ? (
        <div className="flex flex-col gap-2">
          <h1>Perfil de {decodeURIComponent(profile[1])}</h1>
          <a href="/equipo" onClick={go("/equipo")}>Volver al equipo</a>
        </div>
      ) : (
        <h1>No encontrado</h1>
      )}
    </div>
  );
}
