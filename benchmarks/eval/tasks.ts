// Cost eval tasks. The same functional request for every stack.
// `base`: a benchmarks/tasks/ task whose code is the starting point (modification tasks).

// `fullstack`: the app needs a backend; React/Svelte also write a server.ts, ArtScript uses `api`.
// `project`: a multi-file project in benchmarks/eval/projects/<name>/<stack> to modify. `context`:
// "full" sends the whole project; "focus" sends what a good agent would read (ArtScript: `art context`
// of the relevant components; React/Svelte: the file list plus the relevant files), listed in `focus`.
export type Task = {
  id: string; prompt: string; base?: string; fullstack?: boolean;
  project?: string; context?: "full" | "focus"; focus?: Partial<Record<"artscript" | "react" | "svelte" | "vue" | "solid", string[]>>;
};

// Vue and Solid read the same files as React: Solid keeps .tsx, Vue uses .vue.
export function focusFor(task: Task, stack: string): string[] {
  const f = task.focus ?? {};
  if (stack in f) return f[stack as keyof typeof f]!;
  if (stack === "solid") return f.react ?? [];
  if (stack === "vue") return (f.react ?? []).map((n) => n.replace(/\.tsx$/, ".vue"));
  return [];
}

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
  // Added with 0.3/0.4: relations, validations, routes, dialogs and selects.
  {
    id: "fs-blog",
    fullstack: true,
    prompt: "Creá un blog full-stack con autores y posts. Un input con placeholder 'Autor' y un botón 'Crear autor'. Un input con placeholder 'Título', un selector (select) para elegir el autor entre los creados y un botón 'Publicar' que crea el post. Cada post muestra su título y 'por <nombre del autor>'. Cada autor se lista con un botón 'Borrar autor'; si el autor tiene posts no se borra y se muestra 'El autor tiene posts'. Los datos viven en el servidor: al recargar la página siguen ahí.",
  },
  {
    id: "fs-products",
    fullstack: true,
    prompt: "Creá un registro full-stack de productos: inputs con placeholder 'Nombre', 'Código' y 'Precio', y un botón 'Guardar' que crea el producto en el servidor. El servidor rechaza un nombre de menos de 3 caracteres (mostrá 'Nombre muy corto'), un código que ya existe (mostrá 'Código repetido') y un precio negativo (mostrá 'Precio inválido'); en esos casos no se crea nada. Cada producto guardado muestra su nombre y su código. Los datos viven en el servidor: al recargar la página siguen ahí.",
  },
  {
    id: "fs-avatar",
    fullstack: true,
    prompt: "Creá una página de perfil full-stack: un input de archivo para elegir una foto y un botón 'Subir' que la guarda en el servidor. Debajo mostrá la foto subida (una imagen). Si se sube otra, reemplaza a la anterior. La foto vive en el servidor: al recargar la página sigue ahí.",
  },
  {
    id: "routes",
    prompt: "Creá una app con rutas (URLs reales que cambian sin recargar la página). Los productos son Mesa (id 1) y Silla (id 2). En '/' mostrá el título 'Productos' y, por cada producto, su nombre y un link 'Ver' que lleva a '/productos/<id>'. La página '/productos/<id>' muestra el nombre del producto y un link 'Volver' que lleva a '/'. Cualquier otra URL muestra 'No encontrado'.",
  },
  {
    id: "contacts",
    prompt: "Creá una lista de contactos. Un botón 'Nuevo contacto' abre un diálogo (modal) con un input con placeholder 'Nombre', un selector (select) de tipo con las opciones 'Amigo' y 'Trabajo', y los botones 'Guardar' y 'Cancelar'. 'Guardar' agrega el contacto, que se muestra como 'Nombre (Tipo)', y cierra el diálogo; 'Cancelar' lo cierra sin agregar. Con el diálogo cerrado, su contenido no se ve.",
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
// Modifications on a 42-component admin panel (benchmarks/eval/projects/admin, see gen-admin.ts).
const files = (stack: "react" | "svelte", names: string[]) => [...names.map((n) => `${n}.${stack === "react" ? "tsx" : "svelte"}`), "data.ts"];
const ADMIN: Omit<Task, "context">[] = [
  {
    id: "admin-total",
    prompt: "En la página de Proveedores, mostrá 'Total: N' con la suma de la Deuda de todos los proveedores.",
    focus: { artscript: ["SuppliersPage", "SuppliersList"], react: files("react", ["SuppliersPage", "SuppliersList"]), svelte: files("svelte", ["SuppliersPage", "SuppliersList"]) },
  },
  {
    id: "admin-toggle",
    prompt: "En cada fila de Empleados agregá un botón 'Alternar' que activa o desactiva al empleado; los inactivos muestran '(inactivo)' junto al nombre.",
    focus: { artscript: ["EmployeesRow", "EmployeesList", "EmployeesPage"], react: files("react", ["EmployeesRow", "EmployeesList", "EmployeesPage"]), svelte: files("svelte", ["EmployeesRow", "EmployeesList", "EmployeesPage"]) },
  },
  {
    id: "admin-delete",
    prompt: "En cada fila de Cupones agregá un botón 'Eliminar' que quita ese cupón de la lista.",
    focus: { artscript: ["CouponsRow", "CouponsList", "CouponsPage"], react: files("react", ["CouponsRow", "CouponsList", "CouponsPage"]), svelte: files("svelte", ["CouponsRow", "CouponsList", "CouponsPage"]) },
  },
  {
    id: "admin-required",
    prompt: "En el formulario de Clientes, si el nombre está vacío al tocar 'Agregar', mostrá 'Nombre requerido' y no agregues nada.",
    focus: { artscript: ["CustomersForm"], react: files("react", ["CustomersForm"]), svelte: files("svelte", ["CustomersForm"]) },
  },
];

for (const [project, list] of [["shop", SHOP], ["admin", ADMIN]] as const) {
  for (const t of list) for (const context of ["full", "focus"] as const) TASKS.push({ ...t, id: `${t.id}@${context}`, project, context });
}
// The same four changes on the 102-component panel ("xl-*" tasks reuse the admin checks).
for (const t of ADMIN) {
  for (const context of ["full", "focus"] as const) TASKS.push({ ...t, id: `${t.id.replace("admin-", "xl-")}@${context}`, project: "adminxl", context });
}

