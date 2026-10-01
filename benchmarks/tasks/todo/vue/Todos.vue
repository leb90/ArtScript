<script setup lang="ts">
import { computed, ref } from "vue";
import TodoItem from "./TodoItem.vue";
import type { Todo } from "./todo";

const todos = ref<Todo[]>([]);
const draft = ref("");
const pending = computed(() => todos.value.filter((t) => !t.done).length);

function add() {
  if (draft.value.trim() === "") return;
  todos.value.push({ id: crypto.randomUUID(), title: draft.value, done: false });
  draft.value = "";
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2>Tareas</h2>
    <div class="flex items-center gap-2">
      <input v-model="draft" placeholder="¿Qué hay que hacer?" @keydown.enter="add" />
      <button class="primary" @click="add">Agregar</button>
    </div>
    <TodoItem v-for="todo in todos" :key="todo.id" :todo="todo" @remove="(id) => (todos = todos.filter((t) => t.id !== id))" />
    <span v-if="todos.length === 0" class="text-gray-500">No hay tareas</span>
    <span v-else class="text-gray-500">{{ pending }} pendientes</span>
  </div>
</template>
