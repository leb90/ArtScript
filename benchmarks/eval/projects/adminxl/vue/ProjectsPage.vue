<script setup lang="ts">
import { ref } from "vue";
import { SEED, type Item } from "./data";
import ProjectsForm from "./ProjectsForm.vue";
import ProjectsList from "./ProjectsList.vue";

const items = ref<Item[]>(SEED.map((i) => ({ ...i })));

function add(name: string, amount: number) {
  items.value.push({ id: Date.now(), name, amount, active: true });
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h2 class="text-xl font-bold">Proyectos</h2>
    <ProjectsForm @add="add" />
    <ProjectsList :items="items" />
  </div>
</template>
