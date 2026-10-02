<script setup lang="ts">
import { onMounted, ref } from "vue";

type Note = { id: string; text: string };

const user = ref<{ email: string } | null>(null);
const notes = ref<Note[]>([]);
const email = ref("");
const password = ref("");
const text = ref("");
const error = ref("");

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

async function loadNotes() {
  notes.value = await (await fetch("/api/notes")).json();
}

onMounted(async () => {
  user.value = await (await fetch("/api/me")).json();
  if (user.value) await loadNotes();
});

async function enter(url: string) {
  const res = await post(url, { email: email.value, password: password.value });
  if (!res.ok) {
    error.value = "Datos incorrectos";
    return;
  }
  user.value = await res.json();
  email.value = "";
  password.value = "";
  error.value = "";
  await loadNotes();
}

async function logout() {
  await post("/api/logout");
  user.value = null;
  notes.value = [];
}

async function add() {
  await post("/api/notes", { text: text.value });
  text.value = "";
  await loadNotes();
}
</script>

<template>
  <div v-if="user" class="flex flex-col gap-2">
    <p>Hola, {{ user.email }}</p>
    <button @click="logout">Salir</button>
    <div class="flex gap-2">
      <input v-model="text" placeholder="Nota" />
      <button @click="add">Agregar</button>
    </div>
    <ul>
      <li v-for="n in notes" :key="n.id">{{ n.text }}</li>
    </ul>
  </div>
  <div v-else class="flex flex-col gap-2">
    <input v-model="email" placeholder="Email" />
    <input v-model="password" type="password" placeholder="Contraseña" />
    <div class="flex gap-2">
      <button @click="enter('/api/signup')">Crear cuenta</button>
      <button @click="enter('/api/login')">Entrar</button>
    </div>
    <p v-if="error">{{ error }}</p>
  </div>
</template>
