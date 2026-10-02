// The sample store (pure functions): the server fn `seed` stores `samplePlan`, the job
// `refreshSample` adds `freshOrders` so the deployed demo never goes stale.

const FIRST = ["Olivia", "Liam", "Emma", "Noah", "Ava", "Lucas", "Mia", "Mateo", "Sofia", "Ethan", "Isabella", "Leo", "Amelia", "Hugo", "Chloe", "Daniel", "Elena", "Oscar", "Nora", "Felix"];
const LAST = ["Bennett", "Garcia", "Kowalski", "Tanaka", "Okafor", "Silva", "Novak", "Fischer", "Rossi", "Dubois", "Haddad", "Larsen", "Mendoza", "Patel", "Walker", "Kim", "Costa", "Ivanov", "Moreau", "Nguyen"];
const COMPANIES = ["Brightline", "Fernwood Labs", "Halcyon", "Kestrel & Co", "Lumen Works", "Maple Street", "Northbeam", "Quarry", "Saltwater", "Tandem"];
const PLACES = ["United States", "United States", "United States", "Canada", "United Kingdom", "Germany", "France", "Spain", "Argentina", "Brazil", "Mexico", "Australia"];

// `weight`: how often the product sells, relative to the others.
const CATALOG = [
  { name: "Aria Wireless Headphones", category: "Audio", price: 189, stock: 42, weight: 5 },
  { name: "Pulse Earbuds", category: "Audio", price: 79, stock: 120, weight: 9 },
  { name: "Studio Desk Speaker", category: "Audio", price: 129, stock: 35, weight: 4 },
  { name: "Orbit Smartwatch", category: "Wearables", price: 249, stock: 28, weight: 4 },
  { name: "Stride Fitness Band", category: "Wearables", price: 59, stock: 96, weight: 8 },
  { name: "Ergo Laptop Stand", category: "Home office", price: 49, stock: 150, weight: 9 },
  { name: "Summit Standing Desk", category: "Home office", price: 449, stock: 12, weight: 2 },
  { name: "Glide Mechanical Keyboard", category: "Home office", price: 119, stock: 64, weight: 6 },
  { name: "Trail Canvas Backpack", category: "Accessories", price: 89, stock: 58, weight: 5 },
  { name: "Braided USB-C Cable", category: "Accessories", price: 19, stock: 320, weight: 12 },
  { name: "Halo Desk Lamp", category: "Lighting", price: 69, stock: 74, weight: 6 },
  { name: "Ember Ambient Light", category: "Lighting", price: 39, stock: 110, weight: 7 },
];

/** Sample customers have addresses under this domain suffix: how the job recognizes the sample store. */
export const SAMPLE_DOMAIN = ".example";

const DAY = 86400000;

// A small seeded generator: the same store every time, only the dates move with `now`.
function random(seed: number) {
  let s = seed % 2147483647;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function weighted(rand: () => number, weights: number[]): number {
  let roll = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

function statusAt(rand: () => number, ageDays: number): string {
  const r = rand();
  if (r < 0.07) return "cancelled";
  if (ageDays < 2) return r < 0.6 ? "pending" : "paid";
  if (ageDays < 6) return r < 0.2 ? "pending" : r < 0.55 ? "paid" : "shipped";
  if (ageDays < 14) return r < 0.12 ? "paid" : r < 0.4 ? "shipped" : "delivered";
  return "delivered";
}

/** Where an open order stands once it is `ageDays` old (orders move on as the days pass). */
export function statusAfter(status: string, ageDays: number): string {
  if (status === "cancelled" || status === "delivered") return status;
  if (ageDays >= 14) return "delivered";
  if (ageDays >= 6) return "shipped";
  if (ageDays >= 2 && status === "pending") return "paid";
  return status;
}

/** 40 customers, 12 products and 300 orders over the 90 days before `now`. Orders point at their
 *  customer and product by position in those lists. */
export function samplePlan(now: number) {
  const rand = random(20260101);
  const customers = [];
  for (let i = 0; i < 40; i++) {
    const first = FIRST[i % FIRST.length];
    // The second round of first names takes other last names: no two customers share an email.
    const last = LAST[(i * 7 + 3 + Math.floor(i / FIRST.length) * 5) % LAST.length];
    const company = pick(rand, COMPANIES);
    // Half the customers predate the order history; the rest signed up along the way.
    const age = i < 20 ? 90 + rand() * 60 : rand() * 90;
    customers.push({
      name: `${first} ${last}`,
      email: `${first}.${last}@${company.replace(/[^a-z]/gi, "")}${SAMPLE_DOMAIN}`.toLowerCase(),
      company,
      country: pick(rand, PLACES),
      createdAt: Math.round(now - age * DAY),
    });
  }
  const orders = [];
  while (orders.length < 300) {
    // Skewed towards recent days (a growing store), quieter on weekends.
    let age = 90 * Math.pow(rand(), 1.35);
    const weekday = new Date(now - age * DAY).getUTCDay();
    if ((weekday === 0 || weekday === 6) && rand() < 0.45) age = 90 * Math.pow(rand(), 1.35);
    const createdAt = Math.round(now - age * DAY);
    // Only customers that already existed at that moment can have ordered.
    const known = customers.map((c, at) => ({ c, at })).filter((x) => x.c.createdAt <= createdAt);
    const product = weighted(rand, CATALOG.map((p) => p.weight));
    const quantity = 1 + Math.floor(Math.pow(rand(), 2.2) * 4);
    orders.push({ customer: pick(rand, known).at, product, quantity, total: CATALOG[product].price * quantity, status: statusAt(rand, age), createdAt });
  }
  orders.sort((a, b) => a.createdAt - b.createdAt);
  return {
    customers,
    products: CATALOG.map(({ weight, ...product }) => product),
    orders: orders.map((o, i) => ({ ...o, number: `ORD-${1001 + i}` })),
  };
}

type Row = { id: string; name: string; price?: number };

/** A handful of orders (3 to 6 a day, at most 30 days) for the time between `since` and `now`, by
 *  the given customers for the given products; numbered from `nextNumber`. */
export function freshOrders(now: number, since: number, customers: Row[], products: Row[], nextNumber: number) {
  const rand = random(Math.floor(now / 1000));
  const orders = [];
  if (customers.length === 0 || products.length === 0) return [];
  for (let day = Math.min(30, Math.floor((now - since) / DAY)); day > 0; day--) {
    for (let n = 3 + Math.floor(rand() * 4); n > 0; n--) {
      const age = day - rand();
      const customer = pick(rand, customers);
      const product = pick(rand, products);
      const quantity = 1 + Math.floor(Math.pow(rand(), 2.2) * 4);
      orders.push({
        number: `ORD-${nextNumber + orders.length}`,
        customer: customer.id,
        customerName: customer.name,
        product: product.id,
        quantity,
        total: (product.price ?? 0) * quantity,
        status: statusAt(rand, age),
        createdAt: Math.round(now - age * DAY),
      });
    }
  }
  return orders.sort((a, b) => a.createdAt - b.createdAt).map((o, i) => ({ ...o, number: `ORD-${nextNumber + i}` }));
}
