// Single table of UI primitives. Used by the checker, codegen and docs.

export type ElementSpec = {
  html: string;
  cls?: string;
  type?: string; // fixed `type` attribute (checkbox, file)
  content: "text" | "bind" | "src" | null; // what the positional expression means
  // How a bound element reads/writes its state (default: `value`, or by `type=`).
  bind?: "checked" | "file" | "open" | "choice";
  action: "click" | "submit" | "enter" | "change" | null; // event that fires `->`
  children: boolean;
  props: string[];
  flags: string[];
  attrs?: string[]; // flags that set a boolean DOM attribute instead of a style class
};

const LAYOUT = ["gap", "pad", "align", "justify"];
const COMMON = ["class", "style", "id", "ref", "role"];
const MEDIA = ["controls", "autoplay", "loop", "muted"];

export const ELEMENTS: Record<string, ElementSpec> = {
  text: { html: "span", content: "text", action: null, children: false, props: [], flags: ["bold", "muted", "small", "large", "danger", "primary", "success"] },
  title: { html: "h2", content: "text", action: null, children: false, props: [], flags: ["muted", "small", "large"] },
  button: { html: "button", content: "text", action: "click", children: false, props: ["disabled"], flags: ["primary", "danger", "small"] },
  input: { html: "input", content: "bind", action: "enter", children: false, props: ["placeholder", "type", "disabled", "label"], flags: ["required"], attrs: ["required"] },
  textarea: { html: "textarea", content: "bind", action: null, children: false, props: ["placeholder", "rows", "disabled", "label"], flags: ["required"], attrs: ["required"] },
  select: { html: "select", content: "bind", bind: "choice", action: "change", children: false, props: ["options", "placeholder", "disabled", "label"], flags: [] },
  checkbox: { html: "input", type: "checkbox", content: "bind", bind: "checked", action: "change", children: false, props: ["label", "disabled"], flags: [] },
  radio: { html: "div", cls: "a-radio", content: "bind", bind: "choice", action: "change", children: false, props: ["options", "label"], flags: [] },
  tabs: { html: "div", cls: "a-tabs", content: "bind", bind: "choice", action: "change", children: false, props: ["options", "label"], flags: [] },
  file: { html: "input", type: "file", content: "bind", bind: "file", action: "change", children: false, props: ["accept", "label", "disabled"], flags: ["multiple"], attrs: ["multiple"] },
  modal: { html: "dialog", cls: "a-modal a-column", content: "bind", bind: "open", action: null, children: true, props: LAYOUT, flags: [] },
  image: { html: "img", content: "src", action: null, children: false, props: ["alt", "width", "height"], flags: [] },
  video: { html: "video", content: "src", action: null, children: false, props: ["width", "height", "poster"], flags: MEDIA, attrs: MEDIA },
  audio: { html: "audio", content: "src", action: null, children: false, props: [], flags: MEDIA, attrs: MEDIA },
  link: { html: "a", content: "text", action: null, children: true, props: ["to", "href"], flags: ["muted"] },
  badge: { html: "span", cls: "a-badge", content: "text", action: null, children: false, props: [], flags: ["primary", "success", "danger"] },
  icon: { html: "span", cls: "a-icon", content: "text", action: null, children: false, props: ["size", "label"], flags: ["muted", "primary", "success", "danger"] },
  spinner: { html: "span", cls: "a-spinner", content: null, action: null, children: false, props: [], flags: [] },
  divider: { html: "hr", content: null, action: null, children: false, props: [], flags: [] },
  row: { html: "div", cls: "a-row", content: null, action: null, children: true, props: LAYOUT, flags: ["wrap"] },
  column: { html: "div", cls: "a-column", content: null, action: null, children: true, props: LAYOUT, flags: [] },
  grid: { html: "div", cls: "a-grid", content: null, action: null, children: true, props: [...LAYOUT, "cols"], flags: [] },
  card: { html: "div", cls: "a-card", content: null, action: null, children: true, props: LAYOUT, flags: [] },
  form: { html: "form", cls: "a-column", content: null, action: "submit", children: true, props: LAYOUT, flags: [] },
  list: { html: "ul", cls: "a-list", content: null, action: null, children: true, props: [], flags: [] },
  item: { html: "li", content: "text", action: "click", children: true, props: [], flags: ["muted"] },
  table: { html: "table", cls: "a-table", content: null, action: null, children: true, props: [], flags: [] },
  tr: { html: "tr", content: null, action: "click", children: true, props: [], flags: [] },
  th: { html: "th", content: "text", action: null, children: true, props: [], flags: [] },
  td: { html: "td", content: "text", action: null, children: true, props: [], flags: ["muted"] },
};

for (const spec of Object.values(ELEMENTS)) spec.props = [...spec.props, ...COMMON];

// Props whose value is a keyword (written without quotes: `align=center`).
export const ENUM_PROPS: Record<string, string[]> = {
  align: ["start", "center", "end", "stretch"],
  justify: ["start", "center", "end", "between", "around"],
  type: ["text", "number", "email", "password", "checkbox", "date"],
};

// `md:cols=3`: applies from that screen width up (px). Only for these numeric props.
export const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 };
export const RESPONSIVE_PROPS = ["cols", "gap", "pad"];

// Numeric spacing props: 1 unit = 4px.
export const SPACING_PROPS = new Set(["gap", "pad"]);
