// Behavior checks: each task is used like a person would, through what's on screen (texts,
// buttons, placeholders), so the same check applies to every stack. A failure explains what was
// expected and what the screen showed; that message is fed back to the model.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BehaviorError, launch, type AppSize, type Page } from "./app.ts";
import type { Task } from "./tasks.ts";
import type { Files, Stack } from "./validate.ts";

type Check = (p: Page) => Promise<void>;
const has = (p: Page, s: string) => p.text().includes(s);
const twoDecimals = (p: Page) => (p.text().match(/\d+[.,]\d{2}\b/g) ?? []).join("|");

const CHECKS: Record<string, Check> = {
  async counter(p) {
    await p.until(() => has(p, "Contador") && has(p, "El doble es 0"), 'el título "Contador" y "El doble es 0"');
    for (let i = 0; i < 6; i++) await p.click("+");
    await p.until(() => has(p, "El doble es 12") && has(p, "¡Más de 5!"), 'tras 6 clics en "+": "El doble es 12" y "¡Más de 5!"');
    await p.click("-");
    await p.until(() => has(p, "El doble es 10") && !has(p, "¡Más de 5!"), 'tras "-": "El doble es 10" y sin "¡Más de 5!"');
  },

  async todo(p) {
    const box = "¿Qué hay que hacer?";
    await p.until(() => has(p, "No hay tareas"), '"No hay tareas" con la lista vacía');
    await p.fill(box, "Comprar pan");
    await p.press(box, "Enter");
    await p.until(() => has(p, "Comprar pan"), 'que Enter agregue "Comprar pan"');
    await p.fill(box, "Estudiar");
    await p.click("Agregar");
    await p.until(() => has(p, "Estudiar"), 'que el botón "Agregar" agregue "Estudiar"');
    await p.fill(box, "   ");
    await p.click("Agregar");
    await p.until(() => p.count("x") === 2 && has(p, "2 pendientes"), 'que el texto vacío se ignore: 2 tareas y "2 pendientes"');
    await p.check(0);
    await p.until(() => has(p, "1 pendientes"), 'tras completar una tarea: "1 pendientes"');
    await p.click("x", 0);
    await p.until(() => !has(p, "Comprar pan") && has(p, "Estudiar"), 'que "x" borre "Comprar pan"');
  },

  async login(p) {
    const entrar = () => p.button("Entrar");
    await p.until(() => entrar().disabled, '"Entrar" deshabilitado al inicio');
    await p.fill("type:email", "ana");
    await p.fill("type:password", "12345678");
    await p.until(() => entrar().disabled, '"Entrar" deshabilitado si el email no tiene "@"');
    await p.fill("type:email", "ana@x.co");
    await p.until(() => !entrar().disabled, '"Entrar" habilitado con email con "@" y contraseña de 8 caracteres');
    await p.fill("type:password", "1234567");
    await p.until(() => entrar().disabled, '"Entrar" deshabilitado con contraseña de 7 caracteres');
    await p.fill("type:password", "12345678");
    await p.click("Entrar");
    await p.until(() => has(p, "Bienvenido, ana@x.co") && !document.querySelector("input[type=password]"), '"Bienvenido, ana@x.co" en lugar del formulario');
  },

  async search(p) {
    const emails = () => (p.text().match(/@/g) ?? []).length;
    await p.until(() => emails() === 4, "4 usuarios con su email");
    await p.fill("#0", "zzzzzz");
    await p.until(() => emails() === 0 && /\b0\b/.test(p.text()), 'sin resultados y la cantidad "0" al buscar "zzzzzz"');
    await p.fill("#0", "");
    await p.until(() => emails() === 4, "los 4 usuarios otra vez al borrar la búsqueda");
  },

  async cart(p) {
    await p.until(() => p.count("Agregar") === 3, '3 productos con botón "Agregar"');
    await p.click("Agregar", 0);
    await p.until(() => p.count("+") === 1 && twoDecimals(p) !== "", 'el ítem en el carrito con "+" y "-", y el total con 2 decimales');
    const before = twoDecimals(p);
    await p.click("+");
    await p.until(() => twoDecimals(p) !== before, 'que "+" cambie el total');
    await p.click("-");
    await p.click("-");
    await p.until(() => p.count("+") === 0, 'que el ítem se quite del carrito al llegar a 0');
  },

  async tabs(p) {
    await p.until(() => p.count("Perfil") === 1 && p.count("Ajustes") === 1 && p.count("Ayuda") === 1, 'botones "Perfil", "Ajustes" y "Ayuda"');
    const perfil = p.text();
    await p.click("Ajustes");
    await p.until(() => p.text() !== perfil, 'que "Ajustes" cambie el contenido');
    const ajustes = p.text();
    await p.click("Ayuda");
    await p.until(() => p.text() !== ajustes && p.text() !== perfil, 'que "Ayuda" muestre otro contenido');
    await p.click("Perfil");
    await p.until(() => p.text() === perfil, 'que "Perfil" vuelva al contenido inicial');
  },

  async "counter-mod"(p) {
    for (let i = 0; i < 12; i++) await p.click("+");
    await p.until(() => has(p, "El doble es 20") && !has(p, "El doble es 22"), 'tope en 10: "El doble es 20" tras 12 clics en "+"');
    await p.click("Reset");
    await p.until(() => has(p, "El doble es 0"), '"Reset" vuelve a 0');
    await p.click("-");
    await p.until(() => has(p, "El doble es 0") && !has(p, "-2"), 'que no baje de 0');
  },

  async "todo-mod"(p) {
    const box = "¿Qué hay que hacer?";
    for (const t of ["Leche", "Pan"]) { await p.fill(box, t); await p.click("Agregar"); }
    await p.until(() => has(p, "2 pendientes") && p.count("Borrar completadas") === 0, '2 tareas y sin "Borrar completadas"');
    await p.check(0);
    await p.until(() => p.count("Borrar completadas") === 1, '"Borrar completadas" visible con una tarea completada');
    await p.click("Borrar completadas");
    await p.until(() => !has(p, "Leche") && has(p, "Pan") && p.count("Borrar completadas") === 0, 'que borre "Leche", deje "Pan" y oculte el botón');
  },

  // ---------- larger project: the shop ----------
  // Product order in the catalog: Remera $15, Taza $8, Gorra $12, Mochila $45, Lapicera $2, Cuaderno $6.
  async "shop-base"(p) {
    await p.click("Agregar", 0);
    await p.click("Agregar", 0);
    await p.click("Agregar", 1);
    await p.until(() => has(p, "Carrito (3)"), '"Carrito (3)" en el encabezado');
    await p.click("Carrito");
    await p.until(() => has(p, "Total: $38.00"), '"Total: $38.00" con 2 remeras y una taza');
    await p.click("-", 0);
    await p.until(() => has(p, "Total: $23.00"), 'que "-" baje el total a $23.00');
    await p.click("Vaciar carrito");
    await p.until(() => has(p, "El carrito está vacío"), '"El carrito está vacío"');
  },

  async "shop-remove"(p) {
    await p.click("Agregar", 0);
    await p.click("Agregar", 1);
    await p.click("Carrito");
    await p.until(() => has(p, "Remera") && has(p, "Taza"), "Remera y Taza en el carrito");
    await p.click("Quitar", 0);
    await p.until(() => !has(p, "Remera") && has(p, "Taza") && has(p, "Carrito (1)"), 'que "Quitar" elimine la Remera del carrito');
  },

  async "shop-stock"(p) {
    await p.until(() => p.count("Agregar") === 6 && !has(p, "Sin stock"), '6 productos con "Agregar" y ninguno "Sin stock"');
    await p.click("Agregar", 1);
    await p.until(() => has(p, "Sin stock") && p.count("Agregar") === 5, 'que la Taza (stock 1) muestre "Sin stock" en lugar de "Agregar"');
    await p.click("Agregar", 0);
    await p.click("Carrito");
    await p.until(() => has(p, "Taza") && has(p, "Remera") && has(p, "Carrito (2)"), "la Taza y la Remera en el carrito");
  },

  async "shop-discount"(p) {
    await p.click("Agregar", 3);
    await p.click("Agregar", 0);
    await p.click("Carrito");
    await p.until(() => has(p, "Descuento 10%") && has(p, "Total final: $54.00"), '"Descuento 10%" y "Total final: $54.00" con $60 en el carrito');
    await p.click("-", 1);
    await p.until(() => !has(p, "Descuento 10%") && has(p, "Total: $45.00"), 'que el descuento desaparezca con $45');
  },

  async "shop-sort"(p) {
    const order = () => ["Lapicera", "Cuaderno", "Taza", "Gorra", "Remera", "Mochila"].map((n) => p.text().indexOf(n));
    await p.click("Ordenar por precio");
    await p.until(() => order().every((i, k, a) => i >= 0 && (k === 0 || a[k - 1] < i)), "los productos de menor a mayor precio: Lapicera, Cuaderno, Taza, Gorra, Remera, Mochila");
    await p.click("Agregar", 0);
    await p.click("Carrito");
    await p.until(() => has(p, "Lapicera"), 'que "Agregar" del primer producto ordenado agregue la Lapicera');
  },

  // ---------- larger project: the admin panel (sections show Alfa 10, Beta 20, Gama 30 inactive) ----------
  async "admin-base"(p) {
    await p.click("Proveedores");
    await p.until(() => has(p, "Deuda: 20") && has(p, "Gama"), 'la sección Proveedores con "Deuda: 20"');
    await p.fill("Nombre", "Zeta");
    await p.fill("Deuda", "5");
    await p.click("Agregar");
    await p.until(() => has(p, "Zeta") && has(p, "Deuda: 5"), 'que "Agregar" sume a Zeta');
  },

  async "admin-total"(p) {
    await p.click("Proveedores");
    await p.until(() => has(p, "Total: 60"), '"Total: 60" en Proveedores');
    await p.fill("Nombre", "Zeta");
    await p.fill("Deuda", "5");
    await p.click("Agregar");
    await p.until(() => has(p, "Total: 65"), '"Total: 65" después de agregar una deuda de 5');
  },

  async "admin-toggle"(p) {
    const inactive = () => p.text().split("(inactivo)").length - 1;
    await p.click("Empleados");
    await p.until(() => inactive() === 1 && p.count("Alternar") === 3, 'tres botones "Alternar" y un solo "(inactivo)" (Gama)');
    await p.click("Alternar", 0);
    await p.until(() => inactive() === 2, 'dos "(inactivo)" tras desactivar a Alfa');
    await p.click("Alternar", 2);
    await p.until(() => inactive() === 1, 'un solo "(inactivo)" tras activar a Gama');
  },

  async "admin-delete"(p) {
    await p.click("Cupones");
    await p.until(() => p.count("Eliminar") === 3, 'un botón "Eliminar" por cupón');
    await p.click("Eliminar", 1);
    await p.until(() => !has(p, "Beta") && has(p, "Alfa") && has(p, "Gama"), 'que "Eliminar" quite a Beta');
  },

  async "admin-required"(p) {
    const rows = () => p.text().split("Saldo:").length - 1;
    await p.click("Clientes");
    await p.click("Agregar");
    await p.until(() => has(p, "Nombre requerido") && rows() === 3, '"Nombre requerido" y ningún cliente nuevo');
    await p.fill("Nombre", "Zeta");
    await p.fill("Saldo", "5");
    await p.click("Agregar");
    await p.until(() => has(p, "Zeta") && !has(p, "Nombre requerido") && rows() === 4, 'que con nombre se agregue Zeta y se borre el error');
  },

  async "fs-users"(p) {
    await p.until(() => p.count("Agregar") === 1, 'el botón "Agregar"');
    const add = async (name: string, email: string) => { await p.fill("Nombre", name); await p.fill("Email", email); await p.click("Agregar"); };
    await add("Ana", "ana@x.co");
    await p.until(() => has(p, "ana@x.co"), 'que se agregue "ana@x.co"');
    await add("Zed", "nope");
    await p.until(() => has(p, "Email inválido") && !has(p, "Zed"), '"Email inválido" y que no se agregue el usuario');
    await add("Ceci", "ceci@x.co");
    await p.until(() => has(p, "ceci@x.co"), 'que se agregue "ceci@x.co"');
    await p.open();
    await p.until(() => has(p, "ana@x.co") && has(p, "ceci@x.co"), "los usuarios guardados en el servidor después de recargar");
    await p.click("Borrar", 0);
    await p.until(() => !has(p, "ana@x.co") && has(p, "ceci@x.co"), 'que "Borrar" quite al primer usuario');
    await p.open();
    await p.until(() => !has(p, "ana@x.co") && has(p, "ceci@x.co"), "que el borrado persista después de recargar");
  },

  async "fs-shopping"(p) {
    await p.until(() => p.count("Agregar") === 1, 'el botón "Agregar"');
    for (const item of ["Leche", "Pan"]) { await p.fill("Producto", item); await p.click("Agregar"); }
    await p.until(() => has(p, "Leche") && has(p, "Pan") && has(p, "2 por comprar"), '"Leche", "Pan" y "2 por comprar"');
    await p.click("Comprado", 0);
    await p.until(() => has(p, "1 por comprar") && has(p, "✓"), 'tras "Comprado": "1 por comprar" y "✓"');
    await p.open();
    await p.until(() => has(p, "1 por comprar") && has(p, "✓") && has(p, "Pan"), "los datos guardados en el servidor después de recargar");
    await p.click("Borrar", 1);
    await p.until(() => !has(p, "Pan") && has(p, "0 por comprar"), 'que "Borrar" quite "Pan" y quede "0 por comprar"');
    await p.open();
    await p.until(() => !has(p, "Pan") && has(p, "Leche"), "que el borrado persista después de recargar");
  },
};

// Runs the task's behavior check in this process (it installs happy-dom globals while it runs).
// Variants of a task (e.g. "shop-sort@focus") share its check.
// The 102-component panel ("xl-*", "adminxl-*") has the same sections as the admin panel.
const checkFor = (task: Task) => {
  const base = task.id.split("@")[0];
  return CHECKS[base] ?? CHECKS[base.replace(/^(xl|adminxl)-/, "admin-")];
};

type Checked = { errors: string[]; size?: AppSize };

async function runCheck(task: Task, stack: Stack, files: Files): Promise<Checked> {
  const check = checkFor(task);
  if (!check) return { errors: [] };
  let app: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    app = await launch(stack, files, !!task.fullstack);
    await check(app.page);
    return { errors: [], size: app.size };
  } catch (e: any) {
    return { errors: [`Prueba de comportamiento: ${e instanceof BehaviorError ? e.message : `error en la app: ${String(e?.message ?? e).slice(0, 300)}`}`] };
  } finally {
    await app?.close();
  }
}

// Runs the check in a separate Node process, so the simulated browser's globals never touch the
// eval's own fetch/timers and every run starts clean. Returns the failures (empty = it works) and,
// when it works, the size of the app's JavaScript.
export function behaveMeasured(task: Task, stack: Stack, files: Files): Promise<Checked> {
  if (!checkFor(task)) return Promise.resolve({ errors: [] });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("close", () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out.trim().split("\n").pop()!)); }
      catch { resolve({ errors: [`Prueba de comportamiento: la app colgó o terminó sin responder. ${err.slice(0, 200)}`] }); }
    });
    child.stdin.end(JSON.stringify({ task, stack, files }));
  });
}

export const behave = (task: Task, stack: Stack, files: Files) => behaveMeasured(task, stack, files).then((r) => r.errors);

if (process.argv.includes("--worker")) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { task, stack, files } = JSON.parse(input);
  // Apps may log; only the last stdout line is the result.
  console.log("\n" + JSON.stringify(await runCheck(task, stack, files)));
  process.exit(0);
}
