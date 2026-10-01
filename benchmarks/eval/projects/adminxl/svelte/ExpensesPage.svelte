<script lang="ts">
  import { SEED, type Item } from "./data";
  import ExpensesForm from "./ExpensesForm.svelte";
  import ExpensesList from "./ExpensesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Gastos</h2>
  <ExpensesForm onAdd={add} />
  <ExpensesList {items} />
</div>
