<script lang="ts">
  import { SEED, type Item } from "./data";
  import PartnersForm from "./PartnersForm.svelte";
  import PartnersList from "./PartnersList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Socios</h2>
  <PartnersForm onAdd={add} />
  <PartnersList {items} />
</div>
