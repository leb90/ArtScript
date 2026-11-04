type Tab = "catalog" | "cart";

export default function Nav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div className="flex gap-2">
      <button className={tab === "catalog" ? "font-bold" : ""} onClick={() => onChange("catalog")}>Catálogo</button>
      <button className={tab === "cart" ? "font-bold" : ""} onClick={() => onChange("cart")}>Carrito</button>
    </div>
  );
}
