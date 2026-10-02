// Formatting helpers and the fixed vocabularies shared by the pages and the server.

export const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];

export const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

export const STATUS_FILTER = [{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS];

export const CATEGORIES = ["Audio", "Wearables", "Home office", "Accessories", "Lighting"];

export const COUNTRIES = ["United States", "Canada", "United Kingdom", "Germany", "France", "Spain", "Argentina", "Brazil", "Mexico", "Australia"];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdShort = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("en-US");

export function formatMoney(n: number, compact = false): string {
  return (compact ? usdShort : usd).format(n ?? 0);
}

export function formatNumber(n: number): string {
  return int.format(n ?? 0);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function statusLabel(status: string): string {
  return status ? status[0].toUpperCase() + status.slice(1) : "";
}

export function initials(name: string): string {
  return (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export function isEmail(text: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((text ?? "").trim());
}
