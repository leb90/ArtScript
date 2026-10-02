// Prices a cart from the products stored on the server: the browser only says which product and
// how many. Used by the `quote` and `placeOrder` server functions.
type Product = { id: string; name: string; price: number; stock: number };

export function priceCart(find: (id: string) => Product | null, wanted: unknown) {
  const lines: { productId: string; name: string; price: number; qty: number }[] = [];
  const problems: string[] = [];
  const merged = new Map<string, number>();
  for (const w of Array.isArray(wanted) ? wanted : []) {
    const qty = Math.floor(Number(w?.qty));
    if (typeof w?.id === "string" && qty > 0) merged.set(w.id, (merged.get(w.id) ?? 0) + qty);
  }
  for (const [id, qty] of merged) {
    const p = find(id);
    if (!p) problems.push("A product in your cart is no longer available");
    else if (p.stock <= 0) problems.push(`${p.name} is sold out`);
    else if (p.stock < qty) problems.push(`Only ${p.stock} left of ${p.name}`);
    else lines.push({ productId: p.id, name: p.name, price: p.price, qty });
  }
  const total = Math.round(lines.reduce((n, l) => n + l.price * l.qty, 0) * 100) / 100;
  return { lines, total, problems };
}
