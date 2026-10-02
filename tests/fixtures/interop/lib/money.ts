export function toUSD(n: number): string {
  return "$" + n.toFixed(2);
}

export default function round(n: number): number {
  return Math.round(n);
}
