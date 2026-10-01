<script lang="ts">
  import { SEED, type Item } from "./data";
  import ContractsForm from "./ContractsForm.svelte";
  import ContractsList from "./ContractsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Contratos</h2>
  <ContractsForm onAdd={add} />
  <ContractsList {items} />
</div>
