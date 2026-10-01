<script setup lang="ts">
import type { CartItem } from "./data";
import CartItemRow from "./CartItemRow.vue";
import Summary from "./Summary.vue";

defineProps<{ cart: CartItem[] }>();
const emit = defineEmits<{ changeQty: [id: number, delta: number]; clear: [] }>();
</script>

<template>
  <span v-if="cart.length === 0" class="text-gray-500">El carrito está vacío</span>
  <div v-else class="flex flex-col gap-2">
    <CartItemRow v-for="item in cart" :key="item.product.id" :item="item" @change-qty="(d) => emit('changeQty', item.product.id, d)" />
    <Summary :cart="cart" @clear="emit('clear')" />
  </div>
</template>
