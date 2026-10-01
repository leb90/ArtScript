<script setup lang="ts">
import { computed, ref } from "vue";
import { PRODUCTS, type CartItem, type Product } from "./data";
import Header from "./Header.vue";
import Nav from "./Nav.vue";
import Catalog from "./Catalog.vue";
import CartView from "./CartView.vue";
import Footer from "./Footer.vue";

const products = ref<Product[]>(PRODUCTS.map((p) => ({ ...p })));
const cart = ref<CartItem[]>([]);
const tab = ref<"catalog" | "cart">("catalog");
const count = computed(() => cart.value.reduce((n, i) => n + i.qty, 0));

function add(product: Product) {
  const found = cart.value.find((i) => i.product.id === product.id);
  if (found) found.qty++;
  else cart.value.push({ product, qty: 1 });
}

function changeQty(id: number, delta: number) {
  cart.value = cart.value.map((i) => (i.product.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0);
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <Header :count="count" />
    <Nav :tab="tab" @change="(t) => (tab = t)" />
    <Catalog v-if="tab === 'catalog'" :products="products" @add="add" />
    <CartView v-else :cart="cart" @change-qty="changeQty" @clear="cart = []" />
    <Footer />
  </div>
</template>
