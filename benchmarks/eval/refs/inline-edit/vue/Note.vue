<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ save: [text: string] }>();

const editing = ref(false);
const draft = ref("");

function edit() {
  draft.value = props.text;
  editing.value = true;
}

function save() {
  emit("save", draft.value);
  editing.value = false;
}
</script>

<template>
  <div v-if="editing" class="flex gap-2">
    <input v-model="draft" />
    <button @click="save">Guardar</button>
    <button @click="editing = false">Cancelar</button>
  </div>
  <div v-else class="flex gap-2">
    <span>{{ text }}</span>
    <button @click="edit">Editar</button>
  </div>
</template>
