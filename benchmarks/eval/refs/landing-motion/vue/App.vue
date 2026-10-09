<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const cards = [
  { title: "Rápido", text: "Listo en minutos, no en semanas." },
  { title: "Simple", text: "Sin configuración que mantener." },
  { title: "Abierto", text: "Código abierto, sin ataduras." },
];
const shown = ref(0);
const revealed = ref<HTMLElement[]>([]);
let id = 0;
const observers: IntersectionObserver[] = [];

const vReveal = {
  mounted(el: HTMLElement) {
    if (typeof IntersectionObserver === "undefined") { el.classList.add("in"); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } });
    io.observe(el);
    observers.push(io);
  },
};

onMounted(() => {
  const to = 12000, duration = 1200;
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) { shown.value = to; return; }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    shown.value = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
});
onUnmounted(() => { cancelAnimationFrame(id); for (const io of observers) io.disconnect(); });
</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="hero flex flex-col items-center gap-3 p-10">
      <div class="mesh" aria-hidden="true"></div>
      <h1 class="rise text-4xl font-bold">Nimbus</h1>
      <p class="rise text-gray-500" style="--d: 120ms">La forma simple de lanzar tu producto.</p>
      <button class="rise grow rounded bg-blue-600 px-4 py-2 text-white" style="--d: 240ms">Empezar</button>
    </section>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div v-for="(c, i) in cards" :key="c.title" v-reveal class="reveal rounded-xl border p-4" :style="`--d: ${i * 80}ms`">
        <p class="font-semibold">{{ c.title }}</p>
        <p class="text-sm">{{ c.text }}</p>
      </div>
    </div>
    <div v-reveal class="reveal flex flex-col items-center gap-1">
      <p class="text-3xl font-bold">{{ shown.toLocaleString("es-AR") }}+</p>
      <p class="text-gray-500">usuarios</p>
    </div>
  </div>
</template>

<style>
.hero { position: relative; overflow: hidden; }
.mesh { position: absolute; inset: 0; z-index: -1; background: radial-gradient(60% 60% at 20% 30%, #2563eb55, transparent 70%), radial-gradient(50% 50% at 80% 20%, #9333ea44, transparent 70%); background-size: 160% 160%; animation: drift 18s ease-in-out infinite alternate; }
@keyframes drift { to { background-position: 100% 100%, 0% 60%; } }
.rise { animation: rise .6s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0ms); }
@keyframes rise { from { opacity: 0; transform: translateY(16px); } }
.grow { transition: transform .2s; } .grow:hover { transform: scale(1.05); }
.reveal { opacity: 0; transform: translateY(16px); transition: opacity .7s, transform .7s; transition-delay: var(--d, 0ms); }
.reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .mesh, .rise { animation: none; } .reveal { opacity: 1; transform: none; transition: none; } }
</style>
