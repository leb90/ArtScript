// What Next's App Router does in the browser, for the eval's simulated browser: routes from the
// folders, nested layouts that stay mounted, next/link, next/navigation. It only stands in for the
// client: a real `next build` already judged the code, and a real `next start` answers the api.
import { Component, createContext, createElement, lazy, Suspense, use, useContext, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

type Comp = (props: any) => any;
type Layout = { key: string; comp: Comp };
type Route = { path: string; page: Comp; layouts: Layout[] };

// ---------- the address ----------
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => { for (const fn of [...listeners]) fn(); };
const address = () => location.pathname + location.search;

function go(href: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", href);
  notify();
}

// ---------- next/navigation ----------
const ParamsContext = createContext<Record<string, string | string[]>>({});
const NOT_FOUND = Symbol("not found");
class Redirect { to: string; constructor(to: string) { this.to = to; } }

const router = {
  push: (href: string) => go(href),
  replace: (href: string) => go(href, true),
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => { awaited.clear(); notify(); },
  prefetch: () => {},
};
export const useRouter = () => router;
export const usePathname = () => { useSyncExternalStore(subscribe, address); return location.pathname; };
export const useSearchParams = () => { useSyncExternalStore(subscribe, address); return new URLSearchParams(location.search); };
export const useParams = () => useContext(ParamsContext);
export const useSelectedLayoutSegment = () => { useSyncExternalStore(subscribe, address); return location.pathname.split("/")[1] || null; };
export function notFound(): never { throw NOT_FOUND; }
export function redirect(to: string): never { throw new Redirect(to); }
export const permanentRedirect = redirect;

// ---------- next/link, next/image, next/dynamic, next/script, next/font ----------
const hrefOf = (href: any) => {
  if (typeof href === "string") return href;
  const query = href.query ? `?${new URLSearchParams(href.query)}` : "";
  return `${href.pathname ?? location.pathname}${query}${href.hash ?? ""}`;
};
export function Link({ href, replace, scroll, prefetch, shallow, passHref, legacyBehavior, onClick, ...rest }: any) {
  const to = hrefOf(href);
  return createElement("a", {
    ...rest,
    href: to,
    onClick(e: any) {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
      if (/^[a-z]+:/i.test(to)) return;
      e.preventDefault();
      go(to, replace);
    },
  });
}
export function Image({ src, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }: any) {
  return createElement("img", { ...rest, src: typeof src === "string" ? src : src?.src });
}
export function dynamic(load: () => Promise<any>, options: any = {}) {
  const Lazy = lazy(async () => {
    const m = await load();
    return { default: m.default ?? m };
  });
  const Loading = options.loading;
  return (props: any) => createElement(Suspense, { fallback: Loading ? createElement(Loading) : null }, createElement(Lazy, props));
}
export const Script = () => null;
export const font = () => ({ className: "", variable: "", style: {} });

// ---------- the router ----------
// Server Components may be async: there the server awaits them; here they're awaited once per address.
const awaited = new Map<string, Promise<any>>();
function Run({ comp, props, id }: { comp: Comp; props: any; id: string }) {
  if (comp.constructor?.name !== "AsyncFunction") return createElement(comp, props);
  let promise = awaited.get(id);
  if (!promise) awaited.set(id, (promise = comp(props)));
  return use(promise!);
}

// `notFound()` and `redirect()` are thrown while rendering, in the browser too.
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (error === NOT_FOUND) return this.props.fallback;
    if (error instanceof Redirect) { setTimeout(() => go((error as Redirect).to, true)); return null; }
    throw error;
  }
}

const segments = (path: string) => path.split("/").slice(1).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
function matches(route: Route, at: string[]): Record<string, string | string[]> | null {
  const want = segments(route.path);
  const params: Record<string, string | string[]> = {};
  for (let i = 0; i < want.length; i++) {
    const s = want[i];
    const rest = /^\[(\[)?\.\.\.(\w+)\]?\]$/.exec(s);
    if (rest) {
      if (!rest[1] && i >= at.length) return null;
      if (i < at.length) params[rest[2]] = at.slice(i).map(decodeURIComponent);
      return params;
    }
    if (i >= at.length) return null;
    const dyn = /^\[(\w+)\]$/.exec(s);
    if (dyn) params[dyn[1]] = decodeURIComponent(at[i]);
    else if (s !== at[i]) return null;
  }
  return want.length === at.length ? params : null;
}

const DefaultNotFound = () => createElement("div", null, "404: This page could not be found.");

export function start(routes: Route[], NotFound: Comp | null, rootLayouts: Layout[]) {
  // Static routes win over dynamic ones, as in Next.
  const ordered = [...routes].sort((a, b) => a.path.split("[").length - b.path.split("[").length);
  const fallback = createElement(NotFound ?? DefaultNotFound);
  const wrap = (layouts: Layout[], content: ReactNode, params: unknown, at: string) =>
    layouts.reduceRight<ReactNode>((inner, l) => createElement(Run, { key: l.key, comp: l.comp, id: `${l.key}:${at}`, props: { children: inner, params } }), content);

  function App() {
    const at = useSyncExternalStore(subscribe, address);
    const parts = location.pathname.split("/").filter(Boolean);
    let route: Route | null = null;
    let params: Record<string, string | string[]> = {};
    for (const r of ordered) {
      const m = matches(r, parts);
      if (m) { route = r; params = m; break; }
    }
    if (!route) return wrap(rootLayouts, fallback, Promise.resolve({}), at);
    // A promise and nothing else: Next 16 removed reading `params.id` directly.
    const promised = Promise.resolve(params);
    const search = Promise.resolve(Object.fromEntries(new URLSearchParams(location.search)));
    const page = createElement(Boundary, { key: at, fallback, children: createElement(Run, { comp: route.page, id: `page:${at}`, props: { params: promised, searchParams: search } }) });
    return createElement(ParamsContext.Provider, { value: params }, wrap(route.layouts, createElement(Suspense, { fallback: null }, page), promised, at));
  }

  window.addEventListener("popstate", notify);
  createRoot(document.getElementById("app")!).render(createElement(Suspense, { fallback: null }, createElement(App)));
}
