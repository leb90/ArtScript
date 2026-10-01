<script setup lang="ts">
defineProps<{ count: number }>();
</script>

<template>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Tienda</h1>
    <span class="text-gray-500">Carrito ({{ count }})</span>
  </div>
</template>
