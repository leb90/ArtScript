<script lang="ts" module>
  export type Todo = { id: string; title: string; done: boolean };
</script>

<script lang="ts">
  let { todo, onRemove }: { todo: Todo; onRemove: (id: string) => void } = $props();
</script>

<div class="flex items-center gap-2">
  <input type="checkbox" bind:checked={todo.done} />
  <span>{todo.title}</span>
  <button class="danger small" onclick={() => onRemove(todo.id)}>x</button>
</div>
