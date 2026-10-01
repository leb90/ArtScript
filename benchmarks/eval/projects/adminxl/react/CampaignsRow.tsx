import type { Item } from "./data";

export default function CampaignsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Alcance: {item.amount}</span>
    </div>
  );
}
