import { createMemo, createSignal, Match, onCleanup, Switch } from "solid-js";

export default function App() {
  const [path, setPath] = createSignal(location.pathname);
  const [likes, setLikes] = createSignal(0);
  const onPop = () => setPath(location.pathname);
  window.addEventListener("popstate", onPop);
  onCleanup(() => window.removeEventListener("popstate", onPop));

  const go = (to: string) => (e: MouseEvent) => {
    e.preventDefault();
    history.pushState(null, "", to);
    setPath(to);
  };
  const member = createMemo(() => path().match(/^\/equipo\/([^/]+)$/)?.[1]);

  return (
    <div class="flex flex-col gap-3">
      <nav class="flex gap-2">
        <a href="/" onClick={go("/")}>Inicio</a>
        <a href="/equipo" onClick={go("/equipo")}>Equipo</a>
        <button onClick={() => setLikes(likes() + 1)}>Me gusta</button>
        <span>Likes: {likes()}</span>
      </nav>
      <Switch fallback={<h1>No encontrado</h1>}>
        <Match when={path() === "/"}>
          <h1>Bienvenido</h1>
        </Match>
        <Match when={path() === "/equipo"}>
          <h1>Nuestro equipo</h1>
          <a href="/equipo/ana" onClick={go("/equipo/ana")}>Ana</a>
          <a href="/equipo/beto" onClick={go("/equipo/beto")}>Beto</a>
        </Match>
        <Match when={member()}>
          {(name) => (
            <>
              <h1>Perfil de {name()}</h1>
              <a href="/equipo" onClick={go("/equipo")}>Volver al equipo</a>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}
