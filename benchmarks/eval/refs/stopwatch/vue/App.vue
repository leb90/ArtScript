<script setup lang="ts">
import { onUnmounted, ref } from "vue";

const time = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function start() {
  if (timer !== undefined) return;
  timer = setInterval(() => time.value++, 100);
}

function pause() {
  clearInterval(timer);
  timer = undefined;
}

function reset() {
  pause();
  time.value = 0;
}

onUnmounted(pause);
</script>

<template>
  <div class="flex flex-col gap-2">
    <p>Tiempo: {{ time }}</p>
    <div class="flex gap-2">
      <button @click="start">Iniciar</button>
      <button @click="pause">Pausar</button>
      <button @click="reset">Reiniciar</button>
    </div>
  </div>
</template>
