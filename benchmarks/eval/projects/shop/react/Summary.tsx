import type { CartItem } from "./data";

export default function Summary({ cart, onClear }: { cart: CartItem[]; onClear: () => void }) {
  const total = cart.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  return (
    <div className="flex items-center justify-between border-t pt-2">
      <span className="font-bold">Total: ${total.toFixed(2)}</span>
      <button className="danger" onClick={onClear}>Vaciar carrito</button>
    </div>
  );
}
