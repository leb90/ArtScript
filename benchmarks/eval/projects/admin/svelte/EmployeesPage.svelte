<script lang="ts">
  import { SEED, type Item } from "./data";
  import EmployeesForm from "./EmployeesForm.svelte";
  import EmployeesList from "./EmployeesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Empleados</h2>
  <EmployeesForm onAdd={add} />
  <EmployeesList {items} />
</div>
