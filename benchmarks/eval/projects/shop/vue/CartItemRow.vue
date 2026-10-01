<script setup lang="ts">
import type { CartItem } from "./data";
defineProps<{ item: CartItem }>();
const emit = defineEmits<{ changeQty: [delta: number] }>();
</script>

<template>
  <div class="flex items-center gap-2">
    <span>{{ item.product.name }}</span>
    <button @click="emit('changeQty', -1)">-</button>
    <span>{{ item.qty }}</span>
    <button @click="emit('changeQty', 1)">+</button>
    <span>${{ (item.product.price * item.qty).toFixed(2) }}</span>
  </div>
</template>
