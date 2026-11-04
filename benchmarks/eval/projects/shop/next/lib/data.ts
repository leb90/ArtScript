export type Product = { id: number; name: string; price: number; stock: number };
export type CartItem = { product: Product; qty: number };

export const PRODUCTS: Product[] = [
  { id: 1, name: "Remera", price: 15, stock: 5 },
  { id: 2, name: "Taza", price: 8, stock: 1 },
  { id: 3, name: "Gorra", price: 12, stock: 3 },
  { id: 4, name: "Mochila", price: 45, stock: 2 },
  { id: 5, name: "Lapicera", price: 2, stock: 10 },
  { id: 6, name: "Cuaderno", price: 6, stock: 4 },
];
