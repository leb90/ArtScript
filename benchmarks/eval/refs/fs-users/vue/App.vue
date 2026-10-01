<script setup lang="ts">
import { onMounted, ref } from "vue";

type User = { id: string; name: string; email: string };

const users = ref<User[]>([]);
const name = ref("");
const email = ref("");
const error = ref("");

async function load() {
  users.value = await (await fetch("/api/users")).json();
}
onMounted(load);

async function add() {
  if (!email.value.includes("@")) {
    error.value = "Email inválido";
    return;
  }
  await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.value, email: email.value }) });
  name.value = "";
  email.value = "";
  error.value = "";
  await load();
}

async function remove(id: string) {
  await fetch(`/api/users/${id}`, { method: "DELETE" });
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <input v-model="name" placeholder="Nombre" />
    <input v-model="email" placeholder="Email" />
    <button @click="add">Agregar</button>
    <span v-if="error">{{ error }}</span>
    <div v-for="u in users" :key="u.id" class="flex gap-2">
      <span>{{ u.name }} ({{ u.email }})</span>
      <button @click="remove(u.id)">Borrar</button>
    </div>
  </div>
</template>
