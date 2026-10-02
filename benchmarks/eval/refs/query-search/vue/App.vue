<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const products = ["Mesa", "Silla", "Sillón", "Lámpara"];
const readQuery = () => new URLSearchParams(location.search).get("q") ?? "";
const q = ref(readQuery());
const text = ref(q.value);
const onPop = () => (q.value = text.value = readQuery());
onMounted(() => window.addEventListener("popstate", onPop));
onUnmounted(() => window.removeEventListener("popstate", onPop));

function search() {
  history.pushState(null, "", `?q=${encodeURIComponent(text.value)}`);
  q.value = text.value;
}

const results = computed(() => products.filter((p) => p.toLowerCase().includes(q.value.toLowerCase())));
</script>

<template>
  <div class="flex flex-col gap-2">
    <form class="flex gap-2" @submit.prevent="search">
      <input v-model="text" placeholder="Buscar" />
      <button>Buscar</button>
    </form>
    <ul>
      <li v-for="p in results" :key="p">{{ p }}</li>
    </ul>
    <p>Resultados: {{ results.length }}</p>
  </div>
</template>
