// ArtScript AST. Stable and JSON-serializable (no cycles, no classes).

export type Loc = { file: string; line: number; col: number };

// `params`: the parameter types of a typed callback, `Fn(User, Number)`.
export type TypeRef = { name: string; list: boolean; optional: boolean; params?: TypeRef[]; loc: Loc };

// ---------- Top-level declarations ----------

// `comments` on Program: those after the last declaration.
export type Program = { kind: "Program"; decls: Decl[]; comments?: string[] };
// Comments are kept for fmt and patch: `comments` go before a node, `after` after it (they were
// right before the `}` that closes its block). Any declaration, field, member, view node or statement.
export type Commented = { comments?: string[]; after?: string[] };

export type Decl = ModelDecl | ComponentDecl | ApiDecl | AuthDecl | ServerFnDecl | UseDecl | TestDecl;

// `test "adds a task" { fill "Task" "Milk"  click "Add"  see "1 left" }`: run by `art test` in a
// simulated browser. `name` is `test "<description>"`; steps are calls like `see("x")`.
export type TestDecl = { kind: "Test"; name: string; description: string; body: Stmt[]; loc: Loc };

// `use "date-fns" { format }`, `use "canvas-confetti" as confetti`, `use "./lib/money.ts" { toUSD }`:
// imports from npm packages or local JS/TS modules, visible in every component and server fn.
// `names` are the local names; `renames` maps a local name to the export it comes from (`{ format as fmt }`).
export type UseDecl = { kind: "Use"; name: string; source: string; default: string | null; names: string[]; renames?: Record<string, string>; loc: Loc };

export type ModelDecl = { kind: "Model"; name: string; fields: Field[]; loc: Loc };
// Rules checked by the server on create/update: `name: String min=2 max=50`, `email: Email unique`,
// `code: String match="^[A-Z]{3}$"`. min/max: length of a String or list, value of a Number.
// `author: User cascade`: deleting the user deletes the rows that reference it (see relations).
// `was="name"`: the field was renamed; existing rows are migrated on the next start.
// `photo: File max=2000000 accept="image/*"`: max is bytes for a File; accept as in <input accept>.
export type FieldRules = { min?: number; max?: number; match?: string; unique?: boolean; cascade?: boolean; was?: string; accept?: string };
// `default`: `stock: Number = 0` fills it on create and in existing rows when the field is added.
export type Field = { name: string; type: TypeRef; default?: Expr; rules?: FieldRules; loc: Loc };

// `api users: User [login|private]`: REST resource for a model (list, get, create, update, remove),
// persisted on the server. `login` requires a session; `private` also scopes rows to their `owner`;
// `admin`: anyone reads, only users with role "admin" write.
export type ApiAccess = "public" | "login" | "private" | "admin";
export type ApiDecl = { kind: "Api"; name: string; model: string; access: ApiAccess; modelLoc: Loc; loc: Loc };

// `auth users`: email + password accounts on that api (signup, login, logout, me).
// `auth users with google, github`: also sign-in through those providers (OAuth).
export type AuthDecl = { kind: "Auth"; name: string; api: string; providers?: string[]; loc: Loc };

// `server fn name(params) { ... }`: runs on the server with `db`, `me` and `fail`; called as `server.name()`.
// `every`: a scheduled job (`server job cleanup every "1h" { ... }`): runs on the server on that
// interval, isn't callable from the client, has `db` and `fail` but no `me`.
export type ServerFnDecl = { kind: "ServerFn"; name: string; params: string[]; defaults?: (Expr | null)[]; every?: string; body: Stmt[]; loc: Loc };

// `page` and `component` share a shape; a page has a route and no params.
export type ComponentDecl = {
  kind: "Component";
  page: boolean;
  // `layout Main { ... slot ... }`: wraps pages; `slot` is where the current page renders.
  layout?: boolean;
  name: string;
  // Pages: the route ("/products/:id", "*" for not found) and, optionally, the layout to use.
  // Layouts may name the layout they render inside (`layout Docs layout Site`).
  path: string | null;
  layoutName?: string | null;
  // `requires login|admin`: the router only shows the page to signed-in users (or admins).
  requires?: "login" | "admin";
  params: Param[];
  members: Member[];
  view: ViewNode[];
  loc: Loc;
};

export type Param = { name: string; type: TypeRef; default: Expr | null; loc: Loc };

export type Member = StateDecl | ComputedDecl | FnDecl | DataDecl | RefDecl | HookDecl | StyleDecl;
// `style { .box { ... } }`: CSS that only applies to this component's elements.
export type StyleDecl = { kind: "Style"; name: "style"; css: string; loc: Loc };
export type StateDecl = { kind: "State"; name: string; type: TypeRef | null; init: Expr; loc: Loc };
export type ComputedDecl = { kind: "Computed"; name: string; expr: Expr; loc: Loc };
// `defaults[i]`: default value of params[i] (`fn sort(asc = true)`), when any param has one.
export type FnDecl = { kind: "Fn"; name: string; params: string[]; defaults?: (Expr | null)[]; body: Stmt[]; loc: Loc };
// `data users = api.users.list()`: async value, loaded on mount and reloaded when its api changes.
// `live`: also reloads when another client writes (server-sent events).
export type DataDecl = { kind: "Data"; name: string; expr: Expr; live?: boolean; loc: Loc };
// `ref canvas`: holds the element marked `ref=canvas` (null until the view is built).
export type RefDecl = { kind: "Ref"; name: string; loc: Loc };
// `mount { ... }` runs once after the view is in the page; `effect { ... }` re-runs when what it
// reads changes. Both may register `cleanup { ... }`. `name` is the keyword (for `art patch`).
export type HookDecl = { kind: "Mount" | "Effect"; name: "mount" | "effect"; body: Stmt[]; loc: Loc };

// ---------- View ----------

export type ViewNode = Element | IfView | ForView;

// value null = flag (`primary`). Events are props named `on:<event>` (`on:keydown=save()`).
export type Prop = { name: string; value: Expr | null; loc: Loc };

export type Element = {
  kind: "Element";
  tag: string;
  content: Expr | null;
  props: Prop[];
  action: Stmt[] | null;
  children: ViewNode[];
  loc: Loc;
};

export type IfView = { kind: "IfView"; cond: Expr; then: ViewNode[]; else: ViewNode[] | null; loc: Loc };
// `key` identifies items across updates (default: the item itself), so rows keep their DOM.
export type ForView = { kind: "ForView"; item: string; index: string | null; list: Expr; key?: Expr; body: ViewNode[]; loc: Loc };

// ---------- Statements (fn bodies and actions) ----------

export type Stmt =
  | { kind: "ExprStmt"; expr: Expr; loc: Loc }
  | { kind: "Let"; name: string; init: Expr; loc: Loc }
  | { kind: "If"; cond: Expr; then: Stmt[]; else: Stmt[] | null; loc: Loc }
  | { kind: "Return"; value: Expr | null; loc: Loc }
  | { kind: "Try"; body: Stmt[]; param: string | null; handler: Stmt[]; loc: Loc }
  | { kind: "Cleanup"; body: Stmt[]; loc: Loc };

// ---------- Expressions (a JavaScript subset) ----------

export type Expr =
  | { kind: "Num"; value: number; loc: Loc }
  | { kind: "Str"; value: string; loc: Loc }
  | { kind: "Template"; quasis: string[]; exprs: Expr[]; loc: Loc }
  | { kind: "Bool"; value: boolean; loc: Loc }
  | { kind: "Null"; loc: Loc }
  | { kind: "Ident"; name: string; loc: Loc }
  | { kind: "Member"; object: Expr; prop: string; optional: boolean; loc: Loc }
  | { kind: "Index"; object: Expr; index: Expr; optional: boolean; loc: Loc }
  | { kind: "Call"; callee: Expr; args: Expr[]; optional: boolean; loc: Loc }
  | { kind: "Unary"; op: string; arg: Expr; loc: Loc }
  | { kind: "Update"; op: "++" | "--"; prefix: boolean; arg: Expr; loc: Loc }
  | { kind: "Binary"; op: string; left: Expr; right: Expr; loc: Loc }
  | { kind: "Cond"; test: Expr; then: Expr; else: Expr; loc: Loc }
  | { kind: "Assign"; op: string; target: Expr; value: Expr; loc: Loc }
  | { kind: "Array"; items: Expr[]; loc: Loc }
  | { kind: "Object"; props: ObjProp[]; loc: Loc }
  | { kind: "Arrow"; params: string[]; body: Expr | Stmt[]; loc: Loc }
  | { kind: "Spread"; arg: Expr; loc: Loc };

export type ObjProp = { key: string; value: Expr } | { spread: Expr };
