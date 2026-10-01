<script lang="ts">
  import { SEED, type Item } from "./data";
  import ReviewsForm from "./ReviewsForm.svelte";
  import ReviewsList from "./ReviewsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Reseñas</h2>
  <ReviewsForm onAdd={add} />
  <ReviewsList {items} />
</div>
