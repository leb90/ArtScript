<script lang="ts">
  type Result = { option: string; votes: number; percent: number };

  let results = $state<Result[]>([]);

  async function load() {
    results = await (await fetch("/api/results")).json();
  }
  load();

  async function vote(option: string) {
    await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
    await load();
  }

  async function reset() {
    await fetch("/api/votes", { method: "DELETE" });
    await load();
  }
</script>

<div class="flex flex-col gap-2">
  {#each results as r (r.option)}
    <p>{r.option}: {r.percent}% ({r.votes} votos)</p>
  {/each}
  <div class="flex gap-2">
    <button onclick={() => vote("Perros")}>Votar Perros</button>
    <button onclick={() => vote("Gatos")}>Votar Gatos</button>
    <button onclick={reset}>Reiniciar</button>
  </div>
</div>
