<script setup lang="ts">
import { computed, ref } from "vue";
import type { Product } from "./data";
import SearchBox from "./SearchBox.vue";
import ProductCard from "./ProductCard.vue";

const props = defineProps<{ products: Product[] }>();
const emit = defineEmits<{ add: [product: Product] }>();
const query = ref("");
const shown = computed(() => props.products.filter((p) => p.name.toLowerCase().includes(query.value.toLowerCase())));
</script>

<template>
  <div class="flex flex-col gap-2">
    <SearchBox v-model="query" />
    <div class="grid grid-cols-3 gap-2">
      <ProductCard v-for="p in shown" :key="p.id" :product="p" @add="emit('add', p)" />
    </div>
    <span v-if="shown.length === 0" class="text-gray-500">Sin resultados</span>
  </div>
</template>
