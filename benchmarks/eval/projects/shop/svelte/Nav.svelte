<script lang="ts">
  type Tab = "catalog" | "cart";
  let { tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void } = $props();
</script>

<div class="flex gap-2">
  <button class={tab === "catalog" ? "font-bold" : ""} onclick={() => onChange("catalog")}>Catálogo</button>
  <button class={tab === "cart" ? "font-bold" : ""} onclick={() => onChange("cart")}>Carrito</button>
</div>
