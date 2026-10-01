<script setup lang="ts">
import { ref } from "vue";
import { SEED, type Item } from "./data";
import CoursesForm from "./CoursesForm.vue";
import CoursesList from "./CoursesList.vue";

const items = ref<Item[]>(SEED.map((i) => ({ ...i })));

function add(name: string, amount: number) {
  items.value.push({ id: Date.now(), name, amount, active: true });
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h2 class="text-xl font-bold">Cursos</h2>
    <CoursesForm @add="add" />
    <CoursesList :items="items" />
  </div>
</template>
