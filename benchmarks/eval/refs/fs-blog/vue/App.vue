<script setup lang="ts">
import { onMounted, ref } from "vue";

type Author = { id: string; name: string };
type Post = { id: string; title: string; author: Author | null };

const authors = ref<Author[]>([]);
const posts = ref<Post[]>([]);
const name = ref("");
const title = ref("");
const authorId = ref("");
const error = ref("");

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function load() {
  authors.value = await (await fetch("/api/authors")).json();
  posts.value = await (await fetch("/api/posts")).json();
}
onMounted(load);

async function createAuthor() {
  await fetch("/api/authors", json("POST", { name: name.value }));
  name.value = "";
  await load();
}

async function removeAuthor(id: string) {
  const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
  error.value = res.ok ? "" : "El autor tiene posts";
  await load();
}

async function publish() {
  await fetch("/api/posts", json("POST", { title: title.value, authorId: authorId.value }));
  title.value = "";
  await load();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-2">
      <input v-model="name" placeholder="Autor" />
      <button @click="createAuthor">Crear autor</button>
    </div>
    <div v-for="a in authors" :key="a.id" class="flex gap-2">
      <span>{{ a.name }}</span>
      <button @click="removeAuthor(a.id)">Borrar autor</button>
    </div>
    <span v-if="error" class="text-red-600">{{ error }}</span>
    <div class="flex gap-2">
      <input v-model="title" placeholder="Título" />
      <select v-model="authorId">
        <option value="" disabled>Autor del post</option>
        <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <button @click="publish">Publicar</button>
    </div>
    <p v-for="p in posts" :key="p.id">{{ p.title }} por {{ p.author?.name }}</p>
  </div>
</template>
