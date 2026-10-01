export type Item = { id: number; name: string; amount: number; active: boolean };

export const SEED: Item[] = [
  {
    id: 1,
    name: "Alfa",
    amount: 10,
    active: true
  },
  {
    id: 2,
    name: "Beta",
    amount: 20,
    active: true
  },
  {
    id: 3,
    name: "Gama",
    amount: 30,
    active: false
  }
];
