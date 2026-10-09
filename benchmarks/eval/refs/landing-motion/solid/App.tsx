import { createSignal, onCleanup, onMount } from "solid-js";

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

function reveal(el: HTMLElement) {
  if (typeof IntersectionObserver === "undefined") { el.classList.add("in"); return; }
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } });
  io.observe(el);
  onCleanup(() => io.disconnect());
}

function Card(props: { title: string; text: string; delay: number }) {
  let el: HTMLDivElement | undefined;
  onMount(() => el && reveal(el));
  return (
    <div ref={el} class="reveal rounded-xl border p-4" style={{ "--d": `${props.delay}ms` }}>
      <p class="font-semibold">{props.title}</p>
      <p class="text-sm">{props.text}</p>
    </div>
  );
}

function Counter(props: { to: number; duration?: number }) {
  const [shown, setShown] = createSignal(0);
  onMount(() => {
    const duration = props.duration ?? 1200;
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(props.to); return; }
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(props.to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    onCleanup(() => cancelAnimationFrame(id));
  });
  return <p class="text-3xl font-bold">{shown().toLocaleString("es-AR")}+</p>;
}

export default function App() {
  let stat: HTMLDivElement | undefined;
  onMount(() => stat && reveal(stat));
  return (
    <div class="flex flex-col gap-8">
      <style>{css}</style>
      <section class="hero flex flex-col items-center gap-3 p-10">
        <div class="mesh" aria-hidden="true" />
        <h1 class="rise text-4xl font-bold">Nimbus</h1>
        <p class="rise text-gray-500" style={{ "--d": "120ms" }}>La forma simple de lanzar tu producto.</p>
        <button class="rise grow rounded bg-blue-600 px-4 py-2 text-white" style={{ "--d": "240ms" }}>Empezar</button>
      </section>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Rápido" text="Listo en minutos, no en semanas." delay={0} />
        <Card title="Simple" text="Sin configuración que mantener." delay={80} />
        <Card title="Abierto" text="Código abierto, sin ataduras." delay={160} />
      </div>
      <div ref={stat} class="reveal flex flex-col items-center gap-1">
        <Counter to={12000} />
        <p class="text-gray-500">usuarios</p>
      </div>
    </div>
  );
}
