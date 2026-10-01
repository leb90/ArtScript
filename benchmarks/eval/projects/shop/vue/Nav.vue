<script setup lang="ts">
type Tab = "catalog" | "cart";
defineProps<{ tab: Tab }>();
const emit = defineEmits<{ change: [tab: Tab] }>();
</script>

<template>
  <div class="flex gap-2">
    <button :class="tab === 'catalog' ? 'font-bold' : ''" @click="emit('change', 'catalog')">Catálogo</button>
    <button :class="tab === 'cart' ? 'font-bold' : ''" @click="emit('change', 'cart')">Carrito</button>
  </div>
</template>
