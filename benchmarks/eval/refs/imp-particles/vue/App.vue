<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

type Ball = { x: number; y: number; vx: number; vy: number; r: number };
const W = 400, H = 300;
const make = (): Ball => ({ x: 10 + Math.random() * 380, y: 10 + Math.random() * 280, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, r: 10 });

const canvas = ref<HTMLCanvasElement | null>(null);
let balls: Ball[] = Array.from({ length: 5 }, make);
const count = ref(5);
const frames = ref(0);
const paused = ref(false);
let id = 0;

function step() {
  for (const b of balls) {
    b.vy += 0.2;
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < b.r) { b.x = b.r; b.vx = -b.vx; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -b.vx; }
    if (b.y < b.r) { b.y = b.r; b.vy = -b.vy; }
    if (b.y > H - b.r) { b.y = H - b.r; b.vy = -b.vy; }
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j];
      if (!a || !c) continue;
      const dx = c.x - a.x, dy = c.y - a.y;
      if (dx * dx + dy * dy < (a.r + c.r) * (a.r + c.r)) {
        [a.vx, c.vx] = [c.vx, a.vx];
        [a.vy, c.vy] = [c.vy, a.vy];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const push = (a.r + c.r - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        c.x += (dx / d) * push; c.y += (dy / d) * push;
      }
    }
  }
}

function draw() {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#2563eb";
  for (const b of balls) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tick() {
  if (!paused.value) {
    step();
    draw();
    frames.value++;
  }
  id = requestAnimationFrame(tick);
}

onMounted(() => { id = requestAnimationFrame(tick); });
onUnmounted(() => cancelAnimationFrame(id));

function add() { balls.push(make()); count.value = balls.length; }
function reset() { balls = Array.from({ length: 5 }, make); count.value = 5; frames.value = 0; }
</script>

<template>
  <div class="flex flex-col gap-2">
    <canvas ref="canvas" id="sim" :width="W" :height="H"></canvas>
    <div class="flex gap-3">
      <span>Pelotas: {{ count }}</span>
      <span>Cuadros: {{ frames }}</span>
    </div>
    <div class="flex gap-2">
      <button @click="add">Agregar</button>
      <button @click="paused = !paused">{{ paused ? "Reanudar" : "Pausar" }}</button>
      <button @click="reset">Reiniciar</button>
    </div>
  </div>
</template>
