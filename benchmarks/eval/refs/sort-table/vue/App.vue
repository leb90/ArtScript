<script setup lang="ts">
import { computed, ref } from "vue";

type Employee = { name: string; age: number };

const employees: Employee[] = [
  { name: "Caro", age: 35 },
  { name: "Ana", age: 30 },
  { name: "Dani", age: 28 },
  { name: "Beto", age: 25 },
];
const sortBy = ref<"" | "name" | "age">("");
const filter = ref("");

const rows = computed(() => {
  const found = employees.filter((e) => e.name.toLowerCase().includes(filter.value.toLowerCase()));
  if (sortBy.value === "name") found.sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy.value === "age") found.sort((a, b) => a.age - b.age);
  return found;
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex gap-2">
      <button @click="sortBy = 'name'">Ordenar por nombre</button>
      <button @click="sortBy = 'age'">Ordenar por edad</button>
      <input v-model="filter" placeholder="Filtrar" />
    </div>
    <table>
      <thead>
        <tr><th>Nombre</th><th>Edad</th></tr>
      </thead>
      <tbody>
        <tr v-for="e in rows" :key="e.name">
          <td>{{ e.name }}</td>
          <td>{{ e.age }}</td>
        </tr>
      </tbody>
    </table>
    <p>Empleados: {{ rows.length }}</p>
  </div>
</template>
