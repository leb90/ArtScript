<script lang="ts">
  import { SEED, type Item } from "./data";
  import ProjectsForm from "./ProjectsForm.svelte";
  import ProjectsList from "./ProjectsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Proyectos</h2>
  <ProjectsForm onAdd={add} />
  <ProjectsList {items} />
</div>
