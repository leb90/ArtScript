<script setup lang="ts">
import type { Product } from "./data";
defineProps<{ product: Product }>();
const emit = defineEmits<{ add: [] }>();
</script>

<template>
  <div class="flex flex-col gap-1 rounded border p-2">
    <span class="font-semibold">{{ product.name }}</span>
    <span>${{ product.price.toFixed(2) }}</span>
    <button class="primary" @click="emit('add')">Agregar</button>
  </div>
</template>
