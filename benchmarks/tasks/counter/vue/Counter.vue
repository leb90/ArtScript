<script setup lang="ts">
import { computed, ref } from "vue";

const count = ref(0);
const double = computed(() => count.value * 2);
</script>

<template>
  <div class="flex flex-col gap-4 items-center">
    <h2>Contador</h2>
    <div class="flex items-center gap-2">
      <button @click="count--">-</button>
      <span class="font-semibold">{{ count }}</span>
      <button class="primary" @click="count++">+</button>
    </div>
    <span class="text-gray-500">El doble es {{ double }}</span>
    <span v-if="count > 5">¡Más de 5!</span>
  </div>
</template>
