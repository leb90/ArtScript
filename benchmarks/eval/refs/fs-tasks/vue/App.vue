<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Task = { id: string; title: string; done: boolean };

const tasks = ref<Task[]>([]);
const title = ref("");
const filter = ref("Todas");
const renaming = ref<string | null>(null);
const newTitle = ref("");

const visible = computed(() =>
  tasks.value.filter((t) => filter.value === "Todas" || (filter.value === "Hechas") === t.done),
);

async function load() {
  tasks.value = await (await fetch("/api/tasks")).json();
}
onMounted(load);

async function add() {
  await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.value }) });
  title.value = "";
  await load();
}

async function update(id: string, changes: Partial<Task>) {
  await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) });
  await load();
}

function rename(t: Task) {
  renaming.value = t.id;
  newTitle.value = t.title;
}

async function saveTitle(id: string) {
  await update(id, { title: newTitle.value });
  renaming.value = null;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex gap-2">
      <input v-model="title" placeholder="Tarea" />
      <button @click="add">Agregar</button>
    </div>
    <select v-model="filter">
      <option>Todas</option>
      <option>Pendientes</option>
      <option>Hechas</option>
    </select>
    <div v-for="t in visible" :key="t.id" class="flex gap-2">
      <template v-if="renaming === t.id">
        <input v-model="newTitle" placeholder="Nuevo título" />
        <button @click="saveTitle(t.id)">Guardar</button>
      </template>
      <span v-else>{{ t.title }}</span>
      <span v-if="t.done">(hecha)</span>
      <button v-else @click="update(t.id, { done: true })">Hecha</button>
      <button @click="rename(t)">Renombrar</button>
    </div>
  </div>
</template>
