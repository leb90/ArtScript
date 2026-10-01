<script setup lang="ts">
import type { Todo } from "./todo";

defineProps<{ todo: Todo }>();
const emit = defineEmits<{ remove: [id: string] }>();
</script>

<template>
  <div class="flex items-center gap-2">
    <input type="checkbox" v-model="todo.done" />
    <span>{{ todo.title }}</span>
    <button class="danger small" @click="emit('remove', todo.id)">x</button>
  </div>
</template>
