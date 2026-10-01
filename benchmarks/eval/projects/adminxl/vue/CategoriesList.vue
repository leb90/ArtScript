<script setup lang="ts">
import type { Item } from "./data";
import CategoriesRow from "./CategoriesRow.vue";

defineProps<{ items: Item[] }>();
</script>

<template>
  <span v-if="items.length === 0" class="text-gray-500">Sin registros</span>
  <div v-else class="flex flex-col gap-1">
    <CategoriesRow v-for="item in items" :key="item.id" :item="item" />
  </div>
</template>
