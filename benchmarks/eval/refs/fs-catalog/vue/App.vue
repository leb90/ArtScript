<script setup lang="ts">
import { onMounted, ref } from "vue";

type Product = { id: number; name: string };

const PAGE = 5;
const items = ref<Product[]>([]);
const total = ref(0);
const page = ref(0);
const q = ref("");

async function load() {
  const res = await fetch(`/api/products?q=${encodeURIComponent(q.value)}&page=${page.value}`);
  const data = await res.json();
  items.value = data.items;
  total.value = data.total;
}
onMounted(load);

async function seed() {
  await fetch("/api/seed", { method: "POST" });
  await load();
}

function goTo(n: number) {
  page.value = n;
  load();
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button @click="seed">Cargar ejemplos</button>
    <input v-model="q" placeholder="Buscar" @input="goTo(0)" />
    <ul>
      <li v-for="p in items" :key="p.id">{{ p.name }}</li>
    </ul>
    <p>Total: {{ total }}</p>
    <div class="flex gap-2">
      <button :disabled="page === 0" @click="goTo(page - 1)">Anterior</button>
      <button :disabled="(page + 1) * PAGE >= total" @click="goTo(page + 1)">Siguiente</button>
    </div>
  </div>
</template>
