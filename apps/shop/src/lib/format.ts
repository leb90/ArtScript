const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number) => usd.format(n ?? 0);
export const orderNumber = (id: string) => "#" + String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
export const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
