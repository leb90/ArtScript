<script lang="ts">
  const SECTIONS = [{"key":"products","label":"Productos"},{"key":"customers","label":"Clientes"},{"key":"orders","label":"Pedidos"},{"key":"suppliers","label":"Proveedores"},{"key":"employees","label":"Empleados"},{"key":"categories","label":"Categorías"},{"key":"warehouses","label":"Depósitos"},{"key":"invoices","label":"Facturas"},{"key":"coupons","label":"Cupones"},{"key":"reviews","label":"Reseñas"}];

  let { page, onChange }: { page: string; onChange: (page: string) => void } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each SECTIONS as s (s.key)}
    <button class={page === s.key ? "font-bold" : ""} onclick={() => onChange(s.key)}>{s.label}</button>
  {/each}
</div>
