<script setup lang="ts">
import { computed } from "vue";
import type { CartItem } from "./data";

const props = defineProps<{ cart: CartItem[] }>();
const emit = defineEmits<{ clear: [] }>();
const total = computed(() => props.cart.reduce((sum, i) => sum + i.product.price * i.qty, 0));
</script>

<template>
  <div class="flex items-center justify-between border-t pt-2">
    <span class="font-bold">Total: ${{ total.toFixed(2) }}</span>
    <button class="danger" @click="emit('clear')">Vaciar carrito</button>
  </div>
</template>
