<script setup lang="ts">
import type { Item } from "./data";

defineProps<{ item: Item }>();
</script>

<template>
  <div class="flex gap-2">
    <span class="font-semibold">{{ item.name }}</span>
    <span>Kilometraje: {{ item.amount }}</span>
  </div>
</template>
