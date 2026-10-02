<script setup lang="ts">
import { computed, ref } from "vue";

const SIZE = 10;
const items = Array.from({ length: 23 }, (_, i) => `Ítem ${i + 1}`);
const pages = Math.ceil(items.length / SIZE);
const page = ref(1);
const visible = computed(() => items.slice((page.value - 1) * SIZE, page.value * SIZE));
</script>

<template>
  <div class="flex flex-col gap-2">
    <ul>
      <li v-for="item in visible" :key="item">{{ item }}</li>
    </ul>
    <p>Página {{ page }} de {{ pages }}</p>
    <div class="flex gap-2">
      <button :disabled="page === 1" @click="page--">Anterior</button>
      <button :disabled="page === pages" @click="page++">Siguiente</button>
    </div>
  </div>
</template>
