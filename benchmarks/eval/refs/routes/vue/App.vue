<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const products = [{ id: 1, name: "Mesa" }, { id: 2, name: "Silla" }];
const path = ref(location.pathname);
const onPop = () => (path.value = location.pathname);
onMounted(() => window.addEventListener("popstate", onPop));
onUnmounted(() => window.removeEventListener("popstate", onPop));

function go(e: MouseEvent, to: string) {
  e.preventDefault();
  history.pushState(null, "", to);
  path.value = to;
}

const product = computed(() => {
  const m = path.value.match(/^\/productos\/(\d+)$/);
  return m ? products.find((p) => p.id === Number(m[1])) : undefined;
});
</script>

<template>
  <div v-if="path === '/'">
    <h1>Productos</h1>
    <div v-for="p in products" :key="p.id" class="flex gap-2">
      <span>{{ p.name }}</span>
      <a :href="`/productos/${p.id}`" @click="go($event, `/productos/${p.id}`)">Ver</a>
    </div>
  </div>
  <div v-else-if="product">
    <h1>{{ product.name }}</h1>
    <a href="/" @click="go($event, '/')">Volver</a>
  </div>
  <h1 v-else>No encontrado</h1>
</template>
