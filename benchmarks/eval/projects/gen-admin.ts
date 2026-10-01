// Generates admin panels written idiomatically in ArtScript, React and Svelte, so modification tasks
// run on projects big enough for context selection to matter. Each section has a page, list, row
// and form: benchmarks/eval/projects/admin (10 sections, 42 components) and adminxl (25 sections,
// 102 components). Both share the sections the tasks use.
//
//   node benchmarks/eval/projects/gen-admin.ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let OUT = "";
const ALL_ENTITIES = [
  { name: "Products", label: "Productos", amount: "Precio" },
  { name: "Customers", label: "Clientes", amount: "Saldo" },
  { name: "Orders", label: "Pedidos", amount: "Total" },
  { name: "Suppliers", label: "Proveedores", amount: "Deuda" },
  { name: "Employees", label: "Empleados", amount: "Sueldo" },
  { name: "Categories", label: "Categorías", amount: "Margen" },
  { name: "Warehouses", label: "Depósitos", amount: "Capacidad" },
  { name: "Invoices", label: "Facturas", amount: "Importe" },
  { name: "Coupons", label: "Cupones", amount: "Descuento" },
  { name: "Reviews", label: "Reseñas", amount: "Puntaje" },
  { name: "Shipments", label: "Envíos", amount: "Costo" },
  { name: "Payments", label: "Pagos", amount: "Monto" },
  { name: "Refunds", label: "Devoluciones", amount: "Reintegro" },
  { name: "Branches", label: "Sucursales", amount: "Ventas" },
  { name: "Vehicles", label: "Vehículos", amount: "Kilometraje" },
  { name: "Projects", label: "Proyectos", amount: "Presupuesto" },
  { name: "Tickets", label: "Tickets", amount: "Prioridad" },
  { name: "Campaigns", label: "Campañas", amount: "Alcance" },
  { name: "Contracts", label: "Contratos", amount: "Valor" },
  { name: "Assets", label: "Activos", amount: "Valuación" },
  { name: "Expenses", label: "Gastos", amount: "Gasto" },
  { name: "Subscriptions", label: "Suscripciones", amount: "Cuota" },
  { name: "Partners", label: "Socios", amount: "Aporte" },
  { name: "Events", label: "Eventos", amount: "Asistentes" },
  { name: "Courses", label: "Cursos", amount: "Cupo" },
];
let ENTITIES = ALL_ENTITIES;
const SEED = [
  { id: 1, name: "Alfa", amount: 10, active: true },
  { id: 2, name: "Beta", amount: 20, active: true },
  { id: 3, name: "Gama", amount: 30, active: false },
];
const key = (name: string) => name.toLowerCase();

function write(stack: string, file: string, src: string) {
  mkdirSync(join(OUT, stack), { recursive: true });
  writeFileSync(join(OUT, stack, file), src.trimStart());
}

// ---------- React ----------
function react() {
  write("react", "data.ts", `
export type Item = { id: number; name: string; amount: number; active: boolean };

export const SEED: Item[] = ${JSON.stringify(SEED, null, 2).replace(/"(\w+)":/g, "$1:")};
`);
  for (const e of ENTITIES) {
    const N = e.name;
    write("react", `${N}Page.tsx`, `
import { useState } from "react";
import { SEED, type Item } from "./data";
import ${N}Form from "./${N}Form";
import ${N}List from "./${N}List";

export default function ${N}Page() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">${e.label}</h2>
      <${N}Form onAdd={add} />
      <${N}List items={items} />
    </div>
  );
}
`);
    write("react", `${N}List.tsx`, `
import type { Item } from "./data";
import ${N}Row from "./${N}Row";

export default function ${N}List({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <${N}Row key={item.id} item={item} />
      ))}
    </div>
  );
}
`);
    write("react", `${N}Row.tsx`, `
import type { Item } from "./data";

export default function ${N}Row({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>${e.amount}: {item.amount}</span>
    </div>
  );
}
`);
    write("react", `${N}Form.tsx`, `
import { useState } from "react";

export default function ${N}Form({ onAdd }: { onAdd: (name: string, amount: number) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    onAdd(name, Number(amount) || 0);
    setName("");
    setAmount("");
  }

  return (
    <div className="flex gap-2">
      <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="${e.amount}" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button className="primary" onClick={submit}>Agregar</button>
    </div>
  );
}
`);
  }
  write("react", "Nav.tsx", `
const SECTIONS = ${JSON.stringify(ENTITIES.map((e) => ({ key: key(e.name), label: e.label })))};

export default function Nav({ page, onChange }: { page: string; onChange: (page: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <button key={s.key} className={page === s.key ? "font-bold" : ""} onClick={() => onChange(s.key)}>{s.label}</button>
      ))}
    </div>
  );
}
`);
  write("react", "App.tsx", `
import { useState } from "react";
import Nav from "./Nav";
${ENTITIES.map((e) => `import ${e.name}Page from "./${e.name}Page";`).join("\n")}

export default function App() {
  const [page, setPage] = useState("products");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Panel</h1>
      <Nav page={page} onChange={setPage} />
${ENTITIES.map((e) => `      {page === "${key(e.name)}" && <${e.name}Page />}`).join("\n")}
    </div>
  );
}
`);
}

// ---------- Svelte ----------
function svelte() {
  write("svelte", "data.ts", `
export type Item = { id: number; name: string; amount: number; active: boolean };

export const SEED: Item[] = ${JSON.stringify(SEED, null, 2).replace(/"(\w+)":/g, "$1:")};
`);
  for (const e of ENTITIES) {
    const N = e.name;
    write("svelte", `${N}Page.svelte`, `
<script lang="ts">
  import { SEED, type Item } from "./data";
  import ${N}Form from "./${N}Form.svelte";
  import ${N}List from "./${N}List.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">${e.label}</h2>
  <${N}Form onAdd={add} />
  <${N}List {items} />
</div>
`);
    write("svelte", `${N}List.svelte`, `
<script lang="ts">
  import type { Item } from "./data";
  import ${N}Row from "./${N}Row.svelte";

  let { items }: { items: Item[] } = $props();
</script>

{#if items.length === 0}
  <span class="text-gray-500">Sin registros</span>
{:else}
  <div class="flex flex-col gap-1">
    {#each items as item (item.id)}
      <${N}Row {item} />
    {/each}
  </div>
{/if}
`);
    write("svelte", `${N}Row.svelte`, `
<script lang="ts">
  import type { Item } from "./data";

  let { item }: { item: Item } = $props();
</script>

<div class="flex gap-2">
  <span class="font-semibold">{item.name}</span>
  <span>${e.amount}: {item.amount}</span>
</div>
`);
    write("svelte", `${N}Form.svelte`, `
<script lang="ts">
  let { onAdd }: { onAdd: (name: string, amount: number) => void } = $props();
  let name = $state("");
  let amount = $state("");

  function submit() {
    onAdd(name, Number(amount) || 0);
    name = "";
    amount = "";
  }
</script>

<div class="flex gap-2">
  <input placeholder="Nombre" bind:value={name} />
  <input placeholder="${e.amount}" type="number" bind:value={amount} />
  <button class="primary" onclick={submit}>Agregar</button>
</div>
`);
  }
  write("svelte", "Nav.svelte", `
<script lang="ts">
  const SECTIONS = ${JSON.stringify(ENTITIES.map((e) => ({ key: key(e.name), label: e.label })))};

  let { page, onChange }: { page: string; onChange: (page: string) => void } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each SECTIONS as s (s.key)}
    <button class={page === s.key ? "font-bold" : ""} onclick={() => onChange(s.key)}>{s.label}</button>
  {/each}
</div>
`);
  write("svelte", "App.svelte", `
<script lang="ts">
  import Nav from "./Nav.svelte";
${ENTITIES.map((e) => `  import ${e.name}Page from "./${e.name}Page.svelte";`).join("\n")}

  let page = $state("products");
</script>

<div class="flex flex-col gap-4 p-4">
  <h1 class="text-2xl font-bold">Panel</h1>
  <Nav {page} onChange={(p) => (page = p)} />
${ENTITIES.map((e, i) => `  ${i === 0 ? "{#if" : "{:else if"} page === "${key(e.name)}"}\n    <${e.name}Page />`).join("\n")}
  {/if}
</div>
`);
}

// ---------- Vue ----------
function vue() {
  write("vue", "data.ts", `
export type Item = { id: number; name: string; amount: number; active: boolean };

export const SEED: Item[] = ${JSON.stringify(SEED, null, 2).replace(/"(\w+)":/g, "$1:")};
`);
  for (const e of ENTITIES) {
    const N = e.name;
    write("vue", `${N}Page.vue`, `
<script setup lang="ts">
import { ref } from "vue";
import { SEED, type Item } from "./data";
import ${N}Form from "./${N}Form.vue";
import ${N}List from "./${N}List.vue";

const items = ref<Item[]>(SEED.map((i) => ({ ...i })));

function add(name: string, amount: number) {
  items.value.push({ id: Date.now(), name, amount, active: true });
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h2 class="text-xl font-bold">${e.label}</h2>
    <${N}Form @add="add" />
    <${N}List :items="items" />
  </div>
</template>
`);
    write("vue", `${N}List.vue`, `
<script setup lang="ts">
import type { Item } from "./data";
import ${N}Row from "./${N}Row.vue";

defineProps<{ items: Item[] }>();
</script>

<template>
  <span v-if="items.length === 0" class="text-gray-500">Sin registros</span>
  <div v-else class="flex flex-col gap-1">
    <${N}Row v-for="item in items" :key="item.id" :item="item" />
  </div>
</template>
`);
    write("vue", `${N}Row.vue`, `
<script setup lang="ts">
import type { Item } from "./data";

defineProps<{ item: Item }>();
</script>

<template>
  <div class="flex gap-2">
    <span class="font-semibold">{{ item.name }}</span>
    <span>${e.amount}: {{ item.amount }}</span>
  </div>
</template>
`);
    write("vue", `${N}Form.vue`, `
<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ add: [name: string, amount: number] }>();
const name = ref("");
const amount = ref("");

function submit() {
  emit("add", name.value, Number(amount.value) || 0);
  name.value = "";
  amount.value = "";
}
</script>

<template>
  <div class="flex gap-2">
    <input v-model="name" placeholder="Nombre" />
    <input v-model="amount" placeholder="${e.amount}" type="number" />
    <button class="primary" @click="submit">Agregar</button>
  </div>
</template>
`);
  }
  write("vue", "Nav.vue", `
<script setup lang="ts">
const SECTIONS = ${JSON.stringify(ENTITIES.map((e) => ({ key: key(e.name), label: e.label })))};

defineProps<{ page: string }>();
const emit = defineEmits<{ change: [page: string] }>();
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button v-for="s in SECTIONS" :key="s.key" :class="page === s.key ? 'font-bold' : ''" @click="emit('change', s.key)">{{ s.label }}</button>
  </div>
</template>
`);
  write("vue", "App.vue", `
<script setup lang="ts">
import { ref } from "vue";
import Nav from "./Nav.vue";
${ENTITIES.map((e) => `import ${e.name}Page from "./${e.name}Page.vue";`).join("\n")}

const page = ref("products");
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <h1 class="text-2xl font-bold">Panel</h1>
    <Nav :page="page" @change="(p) => (page = p)" />
${ENTITIES.map((e, i) => `    <${e.name}Page ${i === 0 ? "v-if" : "v-else-if"}="page === '${key(e.name)}'" />`).join("\n")}
  </div>
</template>
`);
}

// ---------- Solid ----------
function solid() {
  write("solid", "data.ts", `
export type Item = { id: number; name: string; amount: number; active: boolean };

export const SEED: Item[] = ${JSON.stringify(SEED, null, 2).replace(/"(\w+)":/g, "$1:")};
`);
  for (const e of ENTITIES) {
    const N = e.name;
    write("solid", `${N}Page.tsx`, `
import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import ${N}Form from "./${N}Form";
import ${N}List from "./${N}List";

export default function ${N}Page() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">${e.label}</h2>
      <${N}Form onAdd={add} />
      <${N}List items={items()} />
    </div>
  );
}
`);
    write("solid", `${N}List.tsx`, `
import { For, Show } from "solid-js";
import type { Item } from "./data";
import ${N}Row from "./${N}Row";

export default function ${N}List(props: { items: Item[] }) {
  return (
    <Show when={props.items.length > 0} fallback={<span class="text-gray-500">Sin registros</span>}>
      <div class="flex flex-col gap-1">
        <For each={props.items}>{(item) => <${N}Row item={item} />}</For>
      </div>
    </Show>
  );
}
`);
    write("solid", `${N}Row.tsx`, `
import type { Item } from "./data";

export default function ${N}Row(props: { item: Item }) {
  return (
    <div class="flex gap-2">
      <span class="font-semibold">{props.item.name}</span>
      <span>${e.amount}: {props.item.amount}</span>
    </div>
  );
}
`);
    write("solid", `${N}Form.tsx`, `
import { createSignal } from "solid-js";

export default function ${N}Form(props: { onAdd: (name: string, amount: number) => void }) {
  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");

  function submit() {
    props.onAdd(name(), Number(amount()) || 0);
    setName("");
    setAmount("");
  }

  return (
    <div class="flex gap-2">
      <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      <input placeholder="${e.amount}" type="number" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
      <button class="primary" onClick={submit}>Agregar</button>
    </div>
  );
}
`);
  }
  write("solid", "Nav.tsx", `
import { For } from "solid-js";

const SECTIONS = ${JSON.stringify(ENTITIES.map((e) => ({ key: key(e.name), label: e.label })))};

export default function Nav(props: { page: string; onChange: (page: string) => void }) {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={SECTIONS}>{(s) => <button class={props.page === s.key ? "font-bold" : ""} onClick={() => props.onChange(s.key)}>{s.label}</button>}</For>
    </div>
  );
}
`);
  write("solid", "App.tsx", `
import { createSignal, Match, Switch } from "solid-js";
import Nav from "./Nav";
${ENTITIES.map((e) => `import ${e.name}Page from "./${e.name}Page";`).join("\n")}

export default function App() {
  const [page, setPage] = createSignal("products");

  return (
    <div class="flex flex-col gap-4 p-4">
      <h1 class="text-2xl font-bold">Panel</h1>
      <Nav page={page()} onChange={setPage} />
      <Switch>
${ENTITIES.map((e) => `        <Match when={page() === "${key(e.name)}"}>\n          <${e.name}Page />\n        </Match>`).join("\n")}
      </Switch>
    </div>
  );
}
`);
}

// ---------- ArtScript ----------
function artscript() {
  const seed = `[${SEED.map((s) => `{ id: ${s.id}, name: "${s.name}", amount: ${s.amount}, active: ${s.active} }`).join(", ")}]`;
  write("artscript", "app.art", `
model Item {
  id: Number
  name: String
  amount: Number
  active: Bool
}

page Admin "/" {
  state page = "products"

  column gap=4 pad=4 {
    title "Panel" large
    Nav page=page onChange=(p => page = p)
${ENTITIES.map((e, i) => `    ${i === 0 ? "if" : "} else if"} page == "${key(e.name)}" {\n      ${e.name}Page`).join("\n")}
    }
  }
}

component Nav(page: String, onChange: Fn) {
  row gap=2 wrap {
${ENTITIES.map((e) => `    button "${e.label}" primary=(page == "${key(e.name)}") -> onChange("${key(e.name)}")`).join("\n")}
  }
}
`);
  for (const e of ENTITIES) {
    const N = e.name;
    write("artscript", `${key(N)}.art`, `
component ${N}Page {
  state items: Item[] = ${seed}
  fn add(name, amount) {
    items.push({ id: Date.now(), name, amount, active: true })
  }

  column gap=2 {
    title "${e.label}"
    ${N}Form onAdd=add
    ${N}List items=items
  }
}

component ${N}List(items: Item[]) {
  if items.length == 0 {
    text "Sin registros" muted
  } else {
    column gap=1 {
      for item in items {
        ${N}Row item=item
      }
    }
  }
}

component ${N}Row(item: Item) {
  row gap=2 {
    text item.name bold
    text \`${e.amount}: \${item.amount}\`
  }
}

component ${N}Form(onAdd: Fn) {
  state name = ""
  state amount = 0
  fn submit() {
    onAdd(name, amount)
    name = ""
    amount = 0
  }

  row gap=2 {
    input name placeholder="Nombre"
    input amount placeholder="${e.amount}" type=number
    button "Agregar" primary -> submit()
  }
}
`);
  }
}

for (const [name, count] of [["admin", 10], ["adminxl", 25]] as const) {
  OUT = join(import.meta.dirname, name);
  ENTITIES = ALL_ENTITIES.slice(0, count);
  rmSync(OUT, { recursive: true, force: true });
  react();
  svelte();
  vue();
  solid();
  artscript();
  console.log(`generated ${OUT} (${count} sections, ${count * 4 + 2} components)`);
}
