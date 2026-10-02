<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const members = [{ slug: "ana", name: "Ana" }, { slug: "beto", name: "Beto" }];
const likes = ref(0);
const path = ref(location.pathname);
const onPop = () => (path.value = location.pathname);
onMounted(() => window.addEventListener("popstate", onPop));
onUnmounted(() => window.removeEventListener("popstate", onPop));

function go(e: MouseEvent, to: string) {
  e.preventDefault();
  history.pushState(null, "", to);
  path.value = to;
}

const member = computed(() => path.value.match(/^\/equipo\/([^/]+)$/)?.[1]);
</script>

<template>
  <nav class="flex gap-3">
    <a href="/" @click="go($event, '/')">Inicio</a>
    <a href="/equipo" @click="go($event, '/equipo')">Equipo</a>
    <button @click="likes++">Me gusta</button>
    <span>Likes: {{ likes }}</span>
  </nav>
  <main>
    <h1 v-if="path === '/'">Bienvenido</h1>
    <div v-else-if="path === '/equipo'">
      <h1>Nuestro equipo</h1>
      <ul>
        <li v-for="m in members" :key="m.slug">
          <a :href="`/equipo/${m.slug}`" @click="go($event, `/equipo/${m.slug}`)">{{ m.name }}</a>
        </li>
      </ul>
    </div>
    <div v-else-if="member">
      <h1>Perfil de {{ member }}</h1>
      <a href="/equipo" @click="go($event, '/equipo')">Volver al equipo</a>
    </div>
    <h1 v-else>No encontrado</h1>
  </main>
</template>
