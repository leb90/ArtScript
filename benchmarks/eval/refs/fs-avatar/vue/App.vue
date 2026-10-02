<script setup lang="ts">
import { onMounted, ref } from "vue";

const file = ref<File | null>(null);
const url = ref<string | null>(null);

const toBase64 = (f: File) => new Promise<string>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.readAsDataURL(f);
});

async function load() {
  url.value = (await (await fetch("/api/avatar")).json())?.url ?? null;
}
onMounted(load);

function pick(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}

async function upload() {
  if (!file.value) return;
  await fetch("/api/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: file.value.type, data: await toBase64(file.value) }) });
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <input type="file" accept="image/*" @change="pick" />
    <button @click="upload">Subir</button>
    <img v-if="url" :src="url" alt="Foto de perfil" />
  </div>
</template>
