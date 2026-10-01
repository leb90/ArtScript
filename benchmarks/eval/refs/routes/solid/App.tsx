import { createMemo, createSignal, For, Match, onCleanup, Switch } from "solid-js";

const products = [{ id: 1, name: "Mesa" }, { id: 2, name: "Silla" }];

export default function App() {
  const [path, setPath] = createSignal(location.pathname);
  const onPop = () => setPath(location.pathname);
  window.addEventListener("popstate", onPop);
  onCleanup(() => window.removeEventListener("popstate", onPop));

  const go = (to: string) => (e: MouseEvent) => {
    e.preventDefault();
    history.pushState(null, "", to);
    setPath(to);
  };
  const product = createMemo(() => {
    const m = path().match(/^\/productos\/(\d+)$/);
    return m ? products.find((p) => p.id === Number(m[1])) : undefined;
  });

  return (
    <Switch fallback={<h1>No encontrado</h1>}>
      <Match when={path() === "/"}>
        <h1>Productos</h1>
        <For each={products}>
          {(p) => (
            <div class="flex gap-2">
              <span>{p.name}</span>
              <a href={`/productos/${p.id}`} onClick={go(`/productos/${p.id}`)}>Ver</a>
            </div>
          )}
        </For>
      </Match>
      <Match when={product()}>
        {(p) => (
          <>
            <h1>{p().name}</h1>
            <a href="/" onClick={go("/")}>Volver</a>
          </>
        )}
      </Match>
    </Switch>
  );
}
