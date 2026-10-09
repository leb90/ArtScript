import { useEffect, useRef, useState } from "react";

const css = `
.hero { position: relative; overflow: hidden; }
.mesh { position: absolute; inset: 0; z-index: -1; background: radial-gradient(60% 60% at 20% 30%, #2563eb55, transparent 70%), radial-gradient(50% 50% at 80% 20%, #9333ea44, transparent 70%); background-size: 160% 160%; animation: drift 18s ease-in-out infinite alternate; }
@keyframes drift { to { background-position: 100% 100%, 0% 60%; } }
.rise { animation: rise .6s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0ms); }
@keyframes rise { from { opacity: 0; transform: translateY(16px); } }
.grow { transition: transform .2s; } .grow:hover { transform: scale(1.05); }
.reveal { opacity: 0; transform: translateY(16px); transition: opacity .7s, transform .7s; transition-delay: var(--d, 0ms); }
.reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .mesh, .rise { animation: none; } .reveal { opacity: 1; transform: none; transition: none; } }
`;

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { el.classList.add("in"); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Card({ title, text, delay }: { title: string; text: string; delay: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal rounded-xl border p-4" style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Counter({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(to); return; }
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [to, duration]);
  return <p className="text-3xl font-bold">{shown.toLocaleString("es-AR")}+</p>;
}

export default function App() {
  const stat = useReveal<HTMLDivElement>();
  return (
    <div className="flex flex-col gap-8">
      <style>{css}</style>
      <section className="hero flex flex-col items-center gap-3 p-10">
        <div className="mesh" aria-hidden />
        <h1 className="rise text-4xl font-bold">Nimbus</h1>
        <p className="rise text-gray-500" style={{ "--d": "120ms" } as React.CSSProperties}>La forma simple de lanzar tu producto.</p>
        <button className="rise grow rounded bg-blue-600 px-4 py-2 text-white" style={{ "--d": "240ms" } as React.CSSProperties}>Empezar</button>
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Rápido" text="Listo en minutos, no en semanas." delay={0} />
        <Card title="Simple" text="Sin configuración que mantener." delay={80} />
        <Card title="Abierto" text="Código abierto, sin ataduras." delay={160} />
      </div>
      <div ref={stat} className="reveal flex flex-col items-center gap-1">
        <Counter to={12000} />
        <p className="text-gray-500">usuarios</p>
      </div>
    </div>
  );
}
