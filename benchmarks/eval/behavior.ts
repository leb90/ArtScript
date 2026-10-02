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

  async "fs-blog"(p) {
    await p.until(() => p.count("Crear autor") === 1 && p.count("Publicar") === 1, 'los botones "Crear autor" y "Publicar"');
    for (const name of ["Ana", "Beto"]) { await p.fill("Autor", name); await p.click("Crear autor"); }
    await p.until(() => p.count("Borrar autor") === 2, 'dos autores, cada uno con "Borrar autor"');
    await p.fill("Título", "Hola mundo");
    await p.select(0, "Beto");
    await p.click("Publicar");
    await p.until(() => has(p, "Hola mundo") && has(p, "por Beto"), '"Hola mundo" y "por Beto"');
    await p.click("Borrar autor", 1);
    await p.until(() => has(p, "El autor tiene posts") && p.count("Borrar autor") === 2, '"El autor tiene posts" y que Beto no se borre');
    await p.click("Borrar autor", 0);
    await p.until(() => p.count("Borrar autor") === 1, "que Ana (sin posts) se borre");
    await p.open();
    await p.until(() => has(p, "Hola mundo") && has(p, "por Beto") && p.count("Borrar autor") === 1, "los datos guardados en el servidor después de recargar");
  },

  async "fs-products"(p) {
    await p.until(() => p.count("Guardar") === 1, 'el botón "Guardar"');
    const save = async (name: string, code: string, price: string) => {
      await p.fill("Nombre", name); await p.fill("Código", code); await p.fill("Precio", price); await p.click("Guardar");
    };
    await save("Mesa", "AB1", "10");
    await p.until(() => has(p, "Mesa") && has(p, "AB1"), 'que se guarde "Mesa" (AB1)');
    await save("Me", "XY9", "5");
    await p.until(() => has(p, "Nombre muy corto") && !has(p, "XY9"), '"Nombre muy corto" y que no se guarde XY9');
    await save("Silla", "AB1", "3");
    await p.until(() => has(p, "Código repetido") && !has(p, "Silla"), '"Código repetido" y que no se guarde Silla');
    await save("Banco", "CD2", "-1");
    await p.until(() => has(p, "Precio inválido") && !has(p, "CD2"), '"Precio inválido" y que no se guarde CD2');
    await p.open();
    await p.until(() => has(p, "Mesa") && has(p, "AB1") && !has(p, "Silla") && !has(p, "CD2"), "solo Mesa guardada en el servidor después de recargar");
  },

  async "fs-avatar"(p) {
    await p.until(() => p.count("Subir") === 1, 'el botón "Subir"');
    // The image must show these bytes: from a URL the app's server answers, or as a data: URL.
    const shows = async (bytes: string) => {
      for (const src of p.images()) {
        if (src.startsWith("data:")) { if (Buffer.from(src.split(",")[1] ?? "", src.includes(";base64") ? "base64" : "utf8").toString() === bytes) return true; continue; }
        try { if (src && (await (await fetch(new URL(src, p.url))).text()) === bytes) return true; } catch { /* not served */ }
      }
      return false;
    };
    const until = async (bytes: string, what: string) => {
      for (let i = 0; i < 100; i++) { if (await shows(bytes)) return; await p.settle(25); }
      throw new BehaviorError(`se esperaba ${what}. Imágenes en pantalla: ${JSON.stringify(p.images().map((s) => s.slice(0, 60)))}`);
    };
    await p.upload(0, "yo.png", "PNG-1", "image/png");
    await p.click("Subir");
    await until("PNG-1", "la foto subida en una imagen");
    await p.upload(0, "otra.png", "PNG-2", "image/png");
    await p.click("Subir");
    await until("PNG-2", "la foto nueva en lugar de la anterior");
    await p.open();
    await until("PNG-2", "la foto guardada en el servidor después de recargar");
  },

  async routes(p) {
    await p.until(() => has(p, "Productos") && has(p, "Mesa") && has(p, "Silla"), 'en "/" el título "Productos" con Mesa y Silla');
    await p.link("Ver", 1);
    await p.until(() => p.path() === "/productos/2" && has(p, "Silla") && !has(p, "Mesa"), 'que "Ver" de Silla lleve a /productos/2 y muestre "Silla"');
    await p.link("Volver");
    await p.until(() => p.path() === "/" && has(p, "Productos") && has(p, "Mesa"), 'que "Volver" lleve a "/"');
    await p.open("/productos/1");
    await p.until(() => has(p, "Mesa") && !has(p, "Silla"), 'que abrir /productos/1 muestre "Mesa"');
    await p.open("/no/existe");
    await p.until(() => has(p, "No encontrado"), 'que una URL desconocida muestre "No encontrado"');
  },

  async contacts(p) {
    await p.until(() => p.count("Nuevo contacto") === 1 && p.count("Guardar") === 0, '"Nuevo contacto" y el diálogo cerrado (sin "Guardar" visible)');
    await p.click("Nuevo contacto");
    await p.until(() => p.count("Guardar") === 1 && p.count("Cancelar") === 1, 'el diálogo abierto con "Guardar" y "Cancelar"');
    await p.fill("Nombre", "Ana");
    await p.select(0, "Trabajo");
    await p.click("Guardar");
    await p.until(() => has(p, "Ana (Trabajo)") && p.count("Guardar") === 0, '"Ana (Trabajo)" y el diálogo cerrado');
    await p.click("Nuevo contacto");
    await p.fill("Nombre", "Beto");
    await p.click("Cancelar");
    await p.until(() => !has(p, "Beto") && p.count("Guardar") === 0, 'que "Cancelar" cierre sin agregar a Beto');
  },

  async pagination(p) {
    const items = () => p.text().match(/Ítem \d+/g) ?? [];
    await p.until(() => items().length === 10 && items()[0] === "Ítem 1" && has(p, "Página 1 de 3") && p.button("Anterior").disabled && !p.button("Siguiente").disabled, 'los ítems 1 a 10, "Página 1 de 3" y "Anterior" deshabilitado');
    await p.click("Siguiente");
    await p.until(() => items().length === 10 && items()[0] === "Ítem 11" && has(p, "Página 2 de 3") && !p.button("Anterior").disabled, 'tras "Siguiente": los ítems 11 a 20 y "Página 2 de 3"');
    await p.click("Siguiente");
    await p.until(() => items().length === 3 && items()[2] === "Ítem 23" && has(p, "Página 3 de 3") && p.button("Siguiente").disabled, 'en la última página: los ítems 21 a 23 y "Siguiente" deshabilitado');
    await p.click("Anterior");
    await p.until(() => items()[0] === "Ítem 11" && has(p, "Página 2 de 3"), 'que "Anterior" vuelva a la página 2');
  },

  async "sort-table"(p) {
    const names = () => (p.text().match(/Ana|Beto|Caro|Dani/g) ?? []).join(",");
    await p.until(() => names() === "Caro,Ana,Dani,Beto" && has(p, "Empleados: 4") && document.querySelectorAll("table tr").length >= 4, "una tabla con Caro, Ana, Dani y Beto en ese orden y \"Empleados: 4\"");
    await p.click("Ordenar por nombre");
    await p.until(() => names() === "Ana,Beto,Caro,Dani", 'tras "Ordenar por nombre": Ana, Beto, Caro, Dani');
    await p.click("Ordenar por edad");
    await p.until(() => names() === "Beto,Dani,Ana,Caro", 'tras "Ordenar por edad": Beto (25), Dani (28), Ana (30), Caro (35)');
    await p.fill("Filtrar", "A");
    await p.until(() => names() === "Dani,Ana,Caro" && has(p, "Empleados: 3"), 'al filtrar "A": Dani, Ana y Caro (orden por edad) y "Empleados: 3"');
    await p.fill("Filtrar", "");
    await p.until(() => names() === "Beto,Dani,Ana,Caro" && has(p, "Empleados: 4"), "las 4 filas otra vez, todavía ordenadas por edad");
  },

  async stopwatch(p) {
    const n = () => Number(/Tiempo: (\d+)/.exec(p.text())?.[1] ?? NaN);
    await p.until(() => n() === 0, '"Tiempo: 0" al inicio');
    await p.click("Iniciar");
    await p.click("Iniciar");
    await p.settle(1000);
    await p.until(() => n() >= 6 && n() <= 13, `entre 6 y 13 después de 1 segundo andando (dos clics en "Iniciar" no lo aceleran); hay ${n()}`, 1);
    await p.click("Pausar");
    const paused = n();
    await p.settle(350);
    await p.until(() => n() === paused && paused > 0, '"Pausar" lo detiene conservando el valor', 1);
    await p.click("Iniciar");
    await p.until(() => n() > paused, 'que "Iniciar" lo haga seguir desde donde estaba');
    await p.click("Reiniciar");
    await p.settle(350);
    await p.until(() => n() === 0, '"Reiniciar" vuelve a 0 y lo detiene', 1);
  },

  async "nav-layout"(p) {
    await p.until(() => has(p, "Bienvenido") && has(p, "Likes: 0"), 'en "/" el título "Bienvenido" y "Likes: 0" en el menú');
    await p.click("Me gusta");
    await p.click("Me gusta");
    await p.until(() => has(p, "Likes: 2"), '"Likes: 2" tras dos clics en "Me gusta"');
    await p.link("Equipo");
    await p.until(() => p.path() === "/equipo" && has(p, "Nuestro equipo") && !has(p, "Bienvenido") && has(p, "Likes: 2"), 'que "Equipo" lleve a /equipo, muestre "Nuestro equipo" y el menú conserve "Likes: 2"');
    await p.link("Beto");
    await p.until(() => p.path() === "/equipo/beto" && /Perfil de beto/i.test(p.text()) && has(p, "Likes: 2"), 'que "Beto" lleve a /equipo/beto y muestre "Perfil de beto"');
    await p.link("Volver al equipo");
    await p.until(() => p.path() === "/equipo" && has(p, "Nuestro equipo"), 'que "Volver al equipo" lleve a /equipo');
    await p.link("Inicio");
    await p.until(() => p.path() === "/" && has(p, "Bienvenido") && has(p, "Likes: 2"), 'que "Inicio" lleve a "/" con "Likes: 2"');
    await p.open("/equipo/ana");
    await p.until(() => /Perfil de ana/i.test(p.text()) && p.count("Me gusta") === 1, 'que abrir /equipo/ana muestre "Perfil de ana" y el menú');
  },

  async "query-search"(p) {
    await p.until(() => has(p, "Mesa") && has(p, "Silla") && has(p, "Sillón") && has(p, "Lámpara") && has(p, "Resultados: 4"), 'los 4 productos y "Resultados: 4"');
    await p.fill("Buscar", "sill");
    await p.click("Buscar");
    await p.until(() => window.location.search === "?q=sill" && has(p, "Silla") && has(p, "Sillón") && !has(p, "Mesa") && !has(p, "Lámpara") && has(p, "Resultados: 2"), `la URL con "?q=sill" (ahora: "${window.location.search}"), solo Silla y Sillón y "Resultados: 2"`);
    await p.open("/?q=mesa");
    await p.until(() => has(p, "Mesa") && !has(p, "Silla") && has(p, "Resultados: 1"), 'que abrir "/?q=mesa" muestre solo Mesa y "Resultados: 1"');
  },

  async wizard(p) {
    await p.until(() => has(p, "Paso 1 de 3"), '"Paso 1 de 3"');
    await p.click("Siguiente");
    await p.until(() => has(p, "Nombre requerido") && has(p, "Paso 1 de 3"), '"Nombre requerido" sin avanzar con el nombre vacío');
    await p.fill("Nombre", "Ana");
    await p.click("Siguiente");
    await p.until(() => has(p, "Paso 2 de 3") && p.count("Atrás") === 1, '"Paso 2 de 3" con "Atrás" y "Siguiente"');
    await p.select(0, "Pro");
    await p.check(0);
    await p.click("Siguiente");
    await p.until(() => has(p, "Paso 3 de 3") && has(p, "Ana eligió Pro") && has(p, "Con novedades"), 'el resumen "Ana eligió Pro" y "Con novedades"');
    await p.click("Atrás");
    await p.click("Atrás");
    await p.until(() => has(p, "Paso 1 de 3") && p.input("Nombre").value === "Ana", 'que al volver al paso 1 el nombre siga siendo "Ana"');
    await p.click("Siguiente");
    await p.click("Siguiente");
    await p.until(() => has(p, "Ana eligió Pro") && has(p, "Con novedades"), "que el plan y el checkbox se conserven al volver");
    await p.click("Confirmar");
    await p.until(() => has(p, "¡Listo, Ana!") && !has(p, "Paso"), '"¡Listo, Ana!" en lugar del formulario');
  },

  async "inline-edit"(p) {
    await p.until(() => p.count("Editar") === 3 && has(p, "Comprar pan") && has(p, "Llamar a Ana") && has(p, "Pagar luz") && has(p, "Editadas: 0"), 'las 3 notas con "Editar" y "Editadas: 0"');
    await p.click("Editar", 1);
    await p.until(() => p.count("Guardar") === 1 && p.count("Cancelar") === 1 && p.count("Editar") === 2 && p.input("#0").value === "Llamar a Ana", "solo la segunda nota en edición, con un input con su texto");
    await p.fill("#0", "Llamar a Beto");
    await p.click("Guardar");
    await p.until(() => has(p, "Llamar a Beto") && !has(p, "Llamar a Ana") && has(p, "Editadas: 1") && p.count("Editar") === 3, '"Llamar a Beto" guardado y "Editadas: 1"');
    await p.click("Editar", 0);
    await p.fill("#0", "zzz");
    await p.click("Cancelar");
    await p.until(() => has(p, "Comprar pan") && !has(p, "zzz") && has(p, "Editadas: 1") && p.count("Editar") === 3, 'que "Cancelar" deje "Comprar pan" y "Editadas: 1"');
  },

  async "fs-tasks"(p) {
    await p.until(() => p.count("Agregar") === 1, 'el botón "Agregar"');
    for (const t of ["Lavar", "Cocinar"]) { await p.fill("Tarea", t); await p.click("Agregar"); }
    await p.until(() => has(p, "Lavar") && has(p, "Cocinar") && p.count("Hecha") === 2, '"Lavar" y "Cocinar" con su botón "Hecha"');
    await p.click("Hecha", 0);
    await p.until(() => has(p, "(hecha)") && p.count("Hecha") === 1, 'tras "Hecha": "(hecha)" junto a Lavar y un solo botón "Hecha"');
    await p.click("Renombrar", 1);
    await p.fill("Nuevo título", "Cocinar pasta");
    await p.click("Guardar");
    await p.until(() => has(p, "Cocinar pasta") && p.count("Guardar") === 0, '"Cocinar pasta" tras renombrar');
    await p.select(0, "Hechas");
    await p.until(() => has(p, "Lavar") && !has(p, "Cocinar pasta"), 'con el filtro "Hechas": solo Lavar');
    await p.select(0, "Pendientes");
    await p.until(() => !has(p, "Lavar") && has(p, "Cocinar pasta"), 'con el filtro "Pendientes": solo Cocinar pasta');
    await p.open();
    await p.until(() => has(p, "Lavar") && has(p, "(hecha)") && has(p, "Cocinar pasta"), "las tareas, la hecha y el nuevo título guardados en el servidor después de recargar");
  },

  async "fs-votes"(p) {
    await p.until(() => has(p, "Perros: 0% (0 votos)") && has(p, "Gatos: 0% (0 votos)"), '"Perros: 0% (0 votos)" y "Gatos: 0% (0 votos)"');
    await p.click("Votar Perros");
    await p.click("Votar Perros");
    await p.click("Votar Gatos");
    await p.until(() => has(p, "Perros: 67% (2 votos)") && has(p, "Gatos: 33% (1 votos)"), '"Perros: 67% (2 votos)" y "Gatos: 33% (1 votos)"');
    await p.open();
    await p.until(() => has(p, "Perros: 67% (2 votos)") && has(p, "Gatos: 33% (1 votos)"), "los votos guardados en el servidor después de recargar");
    await p.click("Reiniciar");
    await p.until(() => has(p, "Perros: 0% (0 votos)") && has(p, "Gatos: 0% (0 votos)"), 'que "Reiniciar" borre los votos');
  },

  async "fs-catalog"(p) {
    const items = () => (p.text().match(/Producto \d+/g) ?? []).join(",");
    await p.until(() => has(p, "Total: 0") && p.count("Cargar ejemplos") === 1, '"Total: 0" y el botón "Cargar ejemplos"');
    await p.click("Cargar ejemplos");
    await p.until(() => items() === "Producto 1,Producto 2,Producto 3,Producto 4,Producto 5" && has(p, "Total: 12"), 'los productos 1 a 5 y "Total: 12"');
    await p.click("Siguiente");
    await p.until(() => items() === "Producto 6,Producto 7,Producto 8,Producto 9,Producto 10", "los productos 6 a 10 en la segunda página");
    await p.click("Siguiente");
    await p.until(() => items() === "Producto 11,Producto 12", "los productos 11 y 12 en la tercera página");
    await p.fill("Buscar", "Producto 1");
    await p.until(() => items() === "Producto 1,Producto 10,Producto 11,Producto 12" && has(p, "Total: 4"), 'al buscar "Producto 1": 1, 10, 11 y 12 desde la primera página y "Total: 4"');
    await p.open();
    await p.until(() => has(p, "Total: 12") && items().startsWith("Producto 1,Producto 2"), "los 12 productos guardados en el servidor después de recargar");
    await p.click("Cargar ejemplos");
    await p.settle(200);
    await p.until(() => has(p, "Total: 12"), 'que "Cargar ejemplos" no duplique: "Total: 12"');
  },

  async "fs-notes"(p) {
    const account = async (email: string, password: string, button: string) => {
      await p.fill("Email", email);
      await p.fill("Contraseña", password);
      await p.click(button);
    };
    await p.until(() => p.count("Crear cuenta") === 1 && p.count("Entrar") === 1 && p.input("Contraseña").type === "password", '"Crear cuenta", "Entrar" y un input de contraseña de tipo password');
    await account("ana@x.co", "secreto123", "Crear cuenta");
    await p.until(() => has(p, "Hola, ana@x.co") && p.count("Salir") === 1, '"Hola, ana@x.co" y "Salir" tras crear la cuenta');
    await p.fill("Nota", "Nota de Ana");
    await p.click("Agregar");
    await p.until(() => has(p, "Nota de Ana"), '"Nota de Ana" en la lista');
    await p.click("Salir");
    await p.until(() => p.count("Crear cuenta") === 1 && !has(p, "Nota de Ana"), 'el formulario de acceso tras "Salir"');
    await account("beto@x.co", "clave45678", "Crear cuenta");
    await p.until(() => has(p, "Hola, beto@x.co") && !has(p, "Nota de Ana"), "que Beto no vea la nota de Ana");
    await p.fill("Nota", "Nota de Beto");
    await p.click("Agregar");
    await p.until(() => has(p, "Nota de Beto"), '"Nota de Beto" en la lista');
    await p.click("Salir");
    await p.until(() => p.count("Entrar") === 1, 'el formulario de acceso tras "Salir"');
    await account("ana@x.co", "incorrecta1", "Entrar");
    await p.until(() => has(p, "Datos incorrectos") && !has(p, "Hola,"), '"Datos incorrectos" con una contraseña incorrecta');
    await account("ana@x.co", "secreto123", "Entrar");
    await p.until(() => has(p, "Hola, ana@x.co") && has(p, "Nota de Ana") && !has(p, "Nota de Beto"), "que Ana entre y vea solo su nota");
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
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000); // a hung app must not hold the run
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
  // In a browser a rejected promise nobody awaits (a failed write without try/catch) is logged and
  // the page keeps working; in Node it would end this process and read as "the app hung".
  process.on("unhandledRejection", () => {});
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { task, stack, files } = JSON.parse(input);
  // Apps may log; only the last stdout line is the result.
  console.log("\n" + JSON.stringify(await runCheck(task, stack, files)));
  process.exit(0);
}
