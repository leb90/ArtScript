import { For } from "solid-js";

const SECTIONS = [{"key":"products","label":"Productos"},{"key":"customers","label":"Clientes"},{"key":"orders","label":"Pedidos"},{"key":"suppliers","label":"Proveedores"},{"key":"employees","label":"Empleados"},{"key":"categories","label":"Categorías"},{"key":"warehouses","label":"Depósitos"},{"key":"invoices","label":"Facturas"},{"key":"coupons","label":"Cupones"},{"key":"reviews","label":"Reseñas"}];

export default function Nav(props: { page: string; onChange: (page: string) => void }) {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={SECTIONS}>{(s) => <button class={props.page === s.key ? "font-bold" : ""} onClick={() => props.onChange(s.key)}>{s.label}</button>}</For>
    </div>
  );
}
