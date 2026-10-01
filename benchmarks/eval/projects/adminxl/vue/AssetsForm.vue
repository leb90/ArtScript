<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ add: [name: string, amount: number] }>();
const name = ref("");
const amount = ref("");

function submit() {
  emit("add", name.value, Number(amount.value) || 0);
  name.value = "";
  amount.value = "";
}
</script>

<template>
  <div class="flex gap-2">
    <input v-model="name" placeholder="Nombre" />
    <input v-model="amount" placeholder="Valuación" type="number" />
    <button class="primary" @click="submit">Agregar</button>
  </div>
</template>
