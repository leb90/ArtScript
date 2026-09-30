// Tabla única de primitivas de UI. La usan checker, codegen y la documentación.

export type ElementSpec = {
  html: string;
  cls?: string;
  content: "text" | "bind" | "src" | null; // qué significa la expresión posicional
  action: "click" | "submit" | "enter" | null; // evento que dispara `->`
  children: boolean;
  props: string[];
  flags: string[];
};

const LAYOUT = ["gap", "pad", "align", "justify"];
const COMMON = ["class", "style", "id"];

export const ELEMENTS: Record<string, ElementSpec> = {
  text: { html: "span", content: "text", action: null, children: false, props: [], flags: ["bold", "muted", "small", "large"] },
  title: { html: "h2", content: "text", action: null, children: false, props: [], flags: ["muted", "small", "large"] },
  button: { html: "button", content: "text", action: "click", children: false, props: ["disabled"], flags: ["primary", "danger", "small"] },
  input: { html: "input", content: "bind", action: "enter", children: false, props: ["placeholder", "type", "disabled"], flags: [] },
  image: { html: "img", content: "src", action: null, children: false, props: ["alt", "width", "height"], flags: [] },
  link: { html: "a", content: "text", action: null, children: false, props: ["to", "href"], flags: ["muted"] },
  row: { html: "div", cls: "a-row", content: null, action: null, children: true, props: LAYOUT, flags: ["wrap"] },
  column: { html: "div", cls: "a-column", content: null, action: null, children: true, props: LAYOUT, flags: [] },
  grid: { html: "div", cls: "a-grid", content: null, action: null, children: true, props: [...LAYOUT, "cols"], flags: [] },
  card: { html: "div", cls: "a-card", content: null, action: null, children: true, props: LAYOUT, flags: [] },
  form: { html: "form", cls: "a-column", content: null, action: "submit", children: true, props: LAYOUT, flags: [] },
};

for (const spec of Object.values(ELEMENTS)) spec.props = [...spec.props, ...COMMON];

// Props cuyo valor es una palabra clave (se escribe sin comillas: `align=center`).
export const ENUM_PROPS: Record<string, string[]> = {
  align: ["start", "center", "end", "stretch"],
  justify: ["start", "center", "end", "between", "around"],
  type: ["text", "number", "email", "password", "checkbox", "date"],
};

// Props numéricas de espaciado: 1 unidad = 4px.
export const SPACING_PROPS = new Set(["gap", "pad"]);
