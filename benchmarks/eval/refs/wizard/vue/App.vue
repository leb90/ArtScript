<script setup lang="ts">
import { ref } from "vue";

const step = ref(1);
const name = ref("");
const plan = ref("Gratis");
const news = ref(false);
const error = ref("");
const done = ref(false);

function toPlan() {
  if (!name.value.trim()) {
    error.value = "Nombre requerido";
    return;
  }
  error.value = "";
  step.value = 2;
}
</script>

<template>
  <p v-if="done">¡Listo, {{ name }}!</p>
  <div v-else class="flex flex-col gap-2">
    <p>Paso {{ step }} de 3</p>
    <template v-if="step === 1">
      <input v-model="name" placeholder="Nombre" />
      <span v-if="error">{{ error }}</span>
      <button @click="toPlan">Siguiente</button>
    </template>
    <template v-else-if="step === 2">
      <select v-model="plan">
        <option>Gratis</option>
        <option>Pro</option>
      </select>
      <label><input v-model="news" type="checkbox" /> Recibir novedades</label>
      <div class="flex gap-2">
        <button @click="step = 1">Atrás</button>
        <button @click="step = 3">Siguiente</button>
      </div>
    </template>
    <template v-else>
      <p>{{ name }} eligió {{ plan }}</p>
      <p v-if="news">Con novedades</p>
      <div class="flex gap-2">
        <button @click="step = 2">Atrás</button>
        <button @click="done = true">Confirmar</button>
      </div>
    </template>
  </div>
</template>
