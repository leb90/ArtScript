<script lang="ts">
  import TodoItem, { type Todo } from "./TodoItem.svelte";

  let todos = $state<Todo[]>([]);
  let draft = $state("");
  let pending = $derived(todos.filter((t) => !t.done).length);

  function add() {
    if (draft.trim() === "") return;
    todos.push({ id: crypto.randomUUID(), title: draft, done: false });
    draft = "";
  }
</script>

<div class="flex flex-col gap-4">
  <h2>Tareas</h2>
  <div class="flex items-center gap-2">
    <input bind:value={draft} placeholder="¿Qué hay que hacer?" onkeydown={(e) => e.key === "Enter" && add()} />
    <button class="primary" onclick={add}>Agregar</button>
  </div>
  {#each todos as todo (todo.id)}
    <TodoItem {todo} onRemove={(id) => (todos = todos.filter((t) => t.id !== id))} />
  {/each}
  {#if todos.length === 0}
    <span class="text-gray-500">No hay tareas</span>
  {:else}
    <span class="text-gray-500">{pending} pendientes</span>
  {/if}
</div>
