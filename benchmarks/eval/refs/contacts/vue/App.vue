<script setup lang="ts">
import { ref } from "vue";

type Contact = { name: string; kind: string };

const contacts = ref<Contact[]>([]);
const open = ref(false);
const name = ref("");
const kind = ref("Amigo");

function save() {
  contacts.value.push({ name: name.value, kind: kind.value });
  name.value = "";
  open.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <button @click="open = true">Nuevo contacto</button>
    <p v-for="(c, i) in contacts" :key="i">{{ c.name }} ({{ c.kind }})</p>
    <div v-if="open" role="dialog" class="fixed inset-0 flex items-center justify-center bg-black/40">
      <div class="flex flex-col gap-2 rounded bg-white p-4">
        <input v-model="name" placeholder="Nombre" />
        <select v-model="kind">
          <option>Amigo</option>
          <option>Trabajo</option>
        </select>
        <div class="flex gap-2">
          <button @click="save">Guardar</button>
          <button @click="open = false">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>
