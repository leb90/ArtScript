// Cost eval tasks. The same functional request for every stack.
// `base`: a benchmarks/tasks/ task whose code is the starting point (modification tasks).

// `fullstack`: the app needs a backend; React/Svelte also write a server.ts, ArtScript uses `api`.
// `project`: a multi-file project in benchmarks/eval/projects/<name>/<stack> to modify. `context`:
// "full" sends the whole project; "focus" sends what a good agent would read (ArtScript: `art context`
// of the relevant components; React/Svelte: the file list plus the relevant files), listed in `focus`.
export type Task = {
  id: string; prompt: string; base?: string; fullstack?: boolean;
  project?: string; context?: "full" | "focus"; focus?: Record<"artscript" | "react" | "svelte", string[]>;
};

export const TASKS: Task[] = [
  {
    id: "counter",
    prompt: "Creá un contador: título 'Contador', botones '-' y '+', el número en negrita entre ellos, debajo el texto 'El doble es N' y, solo cuando el contador supera 5, el texto '¡Más de 5!'.",
  },
  {
    id: "todo",
    prompt: "Creá una lista de tareas: un input con placeholder '¿Qué hay que hacer?' que agrega la tarea al presionar Enter o el botón 'Agregar' (ignorar texto vacío). Cada tarea es un componente aparte con un checkbox para completarla, su título y un botón 'x' para borrarla. Abajo mostrar 'No hay tareas' si la lista está vacía, o 'N pendientes'.",
  },
  {
    id: "login",
    prompt: "Creá un formulario de login con campos email y contraseña. El botón 'Entrar' está deshabilitado hasta que el email contenga '@' y la contraseña tenga al menos 8 caracteres. Al enviar, reemplazar el formulario por el texto 'Bienvenido, <email>'. Usá inputs de tipo email y password.",
  },
  {
    id: "search",
    prompt: "Definí un tipo/modelo User con id, name y email, y una lista inicial de 4 usuarios. Mostrá un input de búsqueda que filtra por nombre sin distinguir mayúsculas, la cantidad de resultados y una tarjeta por usuario con su nombre y email.",
  },
  {
    id: "cart",
    prompt: "Creá un carrito de compras: una lista fija de 3 productos (id, nombre, precio) con un botón 'Agregar' en cada uno. El carrito muestra cada ítem con su cantidad y botones '+' y '-' (al llegar a 0 se quita del carrito), y el total con 2 decimales.",
  },
  {
    id: "tabs",
    prompt: "Creá una página con 3 pestañas ('Perfil', 'Ajustes', 'Ayuda') hechas con botones. La pestaña activa se resalta y debajo se muestra un texto distinto según la pestaña activa.",
  },
  {
    id: "counter-mod",
    base: "counter",
    prompt: "Modificá la app: agregá un botón 'Reset' que vuelve el contador a 0, y hacé que el contador no pueda superar 10 ni bajar de 0.",
  },
  {
    id: "todo-mod",
    base: "todo",
    prompt: "Modificá la app: agregá un botón 'Borrar completadas' que elimina las tareas completadas; solo se muestra si hay al menos una completada.",
  },
  {
    id: "fs-users",
    fullstack: true,
    prompt: "Creá una app full-stack de usuarios: inputs con placeholder 'Nombre' y 'Email' y un botón 'Agregar' que crea el usuario en el servidor. Si el email no contiene '@', mostrá 'Email inválido' y no crees nada. Mostrá cada usuario con su nombre, su email y un botón 'Borrar' que lo elimina del servidor. Los datos viven en el servidor: al recargar la página siguen ahí.",
  },
  {
    id: "fs-shopping",
    fullstack: true,
    prompt: "Creá una lista de compras full-stack: un input con placeholder 'Producto' y un botón 'Agregar' que crea el ítem en el servidor. Cada ítem muestra su nombre, un botón 'Comprado' que lo marca como comprado en el servidor (y entonces muestra '✓' junto al nombre) y un botón 'Borrar'. Arriba mostrá 'N por comprar' con la cantidad de ítems no comprados. Los datos viven en el servidor: al recargar la página siguen ahí.",
  },
];

// Modifications on a larger project (benchmarks/eval/projects/shop), each in both context modes.
const SHOP: Omit<Task, "context">[] = [
  {
    id: "shop-remove",
    prompt: "Agregá un botón 'Quitar' en cada ítem del carrito que lo elimina del carrito por completo.",
    focus: { artscript: ["CartItemRow", "CartView", "Shop"], react: ["CartItemRow.tsx", "CartView.tsx", "App.tsx"], svelte: ["CartItemRow.svelte", "CartView.svelte", "App.svelte"] },
  },
  {
    id: "shop-stock",
    prompt: "Usá el stock de cada producto: agregar al carrito descuenta 1 del stock, y si el stock de un producto llega a 0, su tarjeta muestra 'Sin stock' en lugar del botón 'Agregar'.",
    focus: { artscript: ["Shop", "ProductCard", "Product"], react: ["App.tsx", "ProductCard.tsx", "data.ts"], svelte: ["App.svelte", "ProductCard.svelte", "data.ts"] },
  },
  {
    id: "shop-discount",
    prompt: "Si el total del carrito supera $50, mostrá además 'Descuento 10%' y 'Total final: $X' (con 2 decimales) con el descuento aplicado.",
    focus: { artscript: ["Summary"], react: ["Summary.tsx"], svelte: ["Summary.svelte"] },
  },
  {
    id: "shop-sort",
    prompt: "Agregá en el catálogo un botón 'Ordenar por precio' que ordena los productos de menor a mayor precio.",
    focus: { artscript: ["Catalog"], react: ["Catalog.tsx"], svelte: ["Catalog.svelte"] },
  },
];
for (const t of SHOP) for (const context of ["full", "focus"] as const) TASKS.push({ ...t, id: `${t.id}@${context}`, project: "shop", context });

