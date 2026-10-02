// The cart lives in the browser: a small store saved to localStorage and shared by every page.
// Components keep a state in sync with `cartStore.subscribe(v => cart = v)`.
export type CartItem = { id: string; name: string; price: number; image: string; stock: number; qty: number };
type Product = { id: string; name: string; price: number; image: string; stock: number };

const KEY = "shop.cart.v1";
const subs = new Set<(items: CartItem[]) => void>();
let items: CartItem[] = load();

function load(): CartItem[] {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((i) => i && typeof i.id === "string" && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function set(next: CartItem[]) {
  items = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: keep it in memory */ }
  for (const fn of subs) fn(items);
}

// Another tab changed the cart.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { items = load(); for (const fn of subs) fn(items); }
  });
}

export const cartStore = {
  get: () => items,
  subscribe(fn: (items: CartItem[]) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  // Adds `qty` of a product, never past its stock. Returns how many were actually added.
  add(p: Product, qty = 1) {
    const line = items.find((i) => i.id === p.id);
    const room = Math.max(0, p.stock - (line?.qty ?? 0));
    const n = Math.min(qty, room);
    if (n <= 0) return 0;
    const snapshot = { id: p.id, name: p.name, price: p.price, image: p.image, stock: p.stock };
    set(line ? items.map((i) => (i.id === p.id ? { ...snapshot, qty: i.qty + n } : i)) : [...items, { ...snapshot, qty: n }]);
    return n;
  },
  setQty(id: string, qty: number) {
    set(qty <= 0 ? items.filter((i) => i.id !== id) : items.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, Math.max(1, i.stock)) } : i)));
  },
  remove(id: string) { set(items.filter((i) => i.id !== id)); },
  clear() { set([]); },
};

export const cartCount = (list: CartItem[]) => list.reduce((n, i) => n + i.qty, 0);
export const cartTotal = (list: CartItem[]) => Math.round(list.reduce((n, i) => n + i.price * i.qty, 0) * 100) / 100;
