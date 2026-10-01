<script lang="ts">
  import { SEED, type Item } from "./data";
  import CampaignsForm from "./CampaignsForm.svelte";
  import CampaignsList from "./CampaignsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Campañas</h2>
  <CampaignsForm onAdd={add} />
  <CampaignsList {items} />
</div>
