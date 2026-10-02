<script lang="ts">
  type Employee = { name: string; age: number };

  const employees: Employee[] = [
    { name: "Caro", age: 35 },
    { name: "Ana", age: 30 },
    { name: "Dani", age: 28 },
    { name: "Beto", age: 25 },
  ];

  let sort = $state<"" | "name" | "age">("");
  let filter = $state("");

  const rows = $derived.by(() => {
    const found = employees.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
    if (sort === "name") found.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "age") found.sort((a, b) => a.age - b.age);
    return found;
  });
</script>

<div class="flex flex-col gap-2">
  <input placeholder="Filtrar" bind:value={filter} />
  <div class="flex gap-2">
    <button onclick={() => (sort = "name")}>Ordenar por nombre</button>
    <button onclick={() => (sort = "age")}>Ordenar por edad</button>
  </div>
  <table>
    <thead>
      <tr><th>Nombre</th><th>Edad</th></tr>
    </thead>
    <tbody>
      {#each rows as e (e.name)}
        <tr><td>{e.name}</td><td>{e.age}</td></tr>
      {/each}
    </tbody>
  </table>
  <p>Empleados: {rows.length}</p>
</div>
