import { useEffect, useState, type MouseEvent } from "react";

const products = [{ id: 1, name: "Mesa" }, { id: 2, name: "Silla" }];

export default function App() {
  const [path, setPath] = useState(location.pathname);
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

  if (path === "/") {
    return (
      <div>
        <h1>Productos</h1>
        {products.map((p) => (
          <div key={p.id} className="flex gap-2">
            <span>{p.name}</span>
            <a href={`/productos/${p.id}`} onClick={go(`/productos/${p.id}`)}>Ver</a>
          </div>
        ))}
      </div>
    );
  }
  const m = path.match(/^\/productos\/(\d+)$/);
  const product = m && products.find((p) => p.id === Number(m[1]));
  if (product) {
    return (
      <div>
        <h1>{product.name}</h1>
        <a href="/" onClick={go("/")}>Volver</a>
      </div>
    );
  }
  return <h1>No encontrado</h1>;
}
