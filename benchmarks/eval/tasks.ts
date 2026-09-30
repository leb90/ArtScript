// Tareas del eval de costo. El mismo pedido funcional para todos los stacks.
// `base`: tarea de benchmarks/tasks/ cuyo código es el punto de partida (tareas de modificación).

export type Task = { id: string; prompt: string; base?: string };

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
    prompt: "Creá un formulario de login con campos email y contraseña. El botón 'Entrar' está deshabilitado hasta que el email contenga '@' y la contraseña tenga al menos 8 caracteres. Al enviar, reemplazar el formulario por el texto 'Bienvenido, <email>'.",
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
];
