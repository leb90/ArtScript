// ArtScript AST. Stable and JSON-serializable (no cycles, no classes).

export type Loc = { file: string; line: number; col: number };

export type TypeRef = { name: string; list: boolean; optional: boolean; loc: Loc };

// ---------- Top-level declarations ----------

export type Program = { kind: "Program"; decls: Decl[] };

export type Decl = ModelDecl | ComponentDecl | ApiDecl | AuthDecl | ServerFnDecl;

export type ModelDecl = { kind: "Model"; name: string; fields: Field[]; loc: Loc };
export type Field = { name: string; type: TypeRef; loc: Loc };

// `api users: User [login|private]`: REST resource for a model (list, get, create, update, remove),
// persisted on the server. `login` requires a session; `private` also scopes rows to their `owner`;
// `admin`: anyone reads, only users with role "admin" write.
export type ApiAccess = "public" | "login" | "private" | "admin";
export type ApiDecl = { kind: "Api"; name: string; model: string; access: ApiAccess; modelLoc: Loc; loc: Loc };

// `auth users`: email + password accounts on that api (signup, login, logout, me).
export type AuthDecl = { kind: "Auth"; name: string; api: string; loc: Loc };

// `server fn name(params) { ... }`: runs on the server with `db`, `me` and `fail`; called as `server.name()`.
export type ServerFnDecl = { kind: "ServerFn"; name: string; params: string[]; body: Stmt[]; loc: Loc };

// `page` and `component` share a shape; a page has a route and no params.
export type ComponentDecl = {
  kind: "Component";
  page: boolean;
  name: string;
  path: string | null;
  params: Param[];
  members: Member[];
  view: ViewNode[];
  loc: Loc;
};

export type Param = { name: string; type: TypeRef; default: Expr | null; loc: Loc };

export type Member = StateDecl | ComputedDecl | FnDecl | DataDecl;
export type StateDecl = { kind: "State"; name: string; type: TypeRef | null; init: Expr; loc: Loc };
export type ComputedDecl = { kind: "Computed"; name: string; expr: Expr; loc: Loc };
export type FnDecl = { kind: "Fn"; name: string; params: string[]; body: Stmt[]; loc: Loc };
// `data users = api.users.list()`: async value, loaded on mount and reloaded when its api changes.
export type DataDecl = { kind: "Data"; name: string; expr: Expr; loc: Loc };

// ---------- View ----------

export type ViewNode = Element | IfView | ForView;

export type Prop = { name: string; value: Expr | null; loc: Loc }; // value null = flag (`primary`)

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
export type ForView = { kind: "ForView"; item: string; index: string | null; list: Expr; body: ViewNode[]; loc: Loc };

// ---------- Statements (fn bodies and actions) ----------

export type Stmt =
  | { kind: "ExprStmt"; expr: Expr; loc: Loc }
  | { kind: "Let"; name: string; init: Expr; loc: Loc }
  | { kind: "If"; cond: Expr; then: Stmt[]; else: Stmt[] | null; loc: Loc }
  | { kind: "Return"; value: Expr | null; loc: Loc }
  | { kind: "Try"; body: Stmt[]; param: string | null; handler: Stmt[]; loc: Loc };

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
