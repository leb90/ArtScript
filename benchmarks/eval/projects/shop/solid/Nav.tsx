type Tab = "catalog" | "cart";

export default function Nav(props: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div class="flex gap-2">
      <button class={props.tab === "catalog" ? "font-bold" : ""} onClick={() => props.onChange("catalog")}>Catálogo</button>
      <button class={props.tab === "cart" ? "font-bold" : ""} onClick={() => props.onChange("cart")}>Carrito</button>
    </div>
  );
}
