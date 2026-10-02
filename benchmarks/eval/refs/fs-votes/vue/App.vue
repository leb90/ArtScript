<script setup lang="ts">
import { onMounted, ref } from "vue";

type Result = { option: string; votes: number; percent: number };

const results = ref<Result[]>([]);

async function load() {
  results.value = await (await fetch("/api/results")).json();
}
onMounted(load);

async function vote(option: string) {
  await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
  await load();
}

async function reset() {
  await fetch("/api/votes", { method: "DELETE" });
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex gap-2">
      <button @click="vote('Perros')">Votar Perros</button>
      <button @click="vote('Gatos')">Votar Gatos</button>
    </div>
    <p v-for="r in results" :key="r.option">{{ r.option }}: {{ r.percent }}% ({{ r.votes }} votos)</p>
    <button @click="reset">Reiniciar</button>
  </div>
</template>
