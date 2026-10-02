<script setup lang="ts">
import { ref } from "vue";
import Note from "./Note.vue";

const notes = ref(["Comprar pan", "Llamar a Ana", "Pagar luz"]);
const edited = ref(0);

function save(i: number, text: string) {
  notes.value[i] = text;
  edited.value++;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Note v-for="(n, i) in notes" :key="i" :text="n" @save="save(i, $event)" />
    <p>Editadas: {{ edited }}</p>
  </div>
</template>
