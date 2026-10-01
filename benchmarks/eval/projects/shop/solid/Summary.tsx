import type { CartItem } from "./data";

export default function Summary(props: { cart: CartItem[]; onClear: () => void }) {
  const total = () => props.cart.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  return (
    <div class="flex items-center justify-between border-t pt-2">
      <span class="font-bold">Total: ${total().toFixed(2)}</span>
      <button class="danger" onClick={props.onClear}>Vaciar carrito</button>
    </div>
  );
}
