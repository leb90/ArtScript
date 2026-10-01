<script setup lang="ts">
import { onMounted, ref } from "vue";

type Product = { id: string; name: string; code: string; price: number };

const products = ref<Product[]>([]);
const name = ref("");
const code = ref("");
const price = ref("");
const error = ref("");

async function load() {
  products.value = await (await fetch("/api/products")).json();
}
onMounted(load);

async function save() {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: name.value, code: code.value, price: Number(price.value) }),
  });
  error.value = res.ok ? "" : (await res.json()).error;
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <input v-model="name" placeholder="Nombre" />
    <input v-model="code" placeholder="Código" />
    <input v-model="price" placeholder="Precio" />
    <button @click="save">Guardar</button>
    <span v-if="error" class="text-red-600">{{ error }}</span>
    <p v-for="p in products" :key="p.id">{{ p.name }} ({{ p.code }})</p>
  </div>
</template>
