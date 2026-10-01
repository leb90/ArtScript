import type { CartItem } from "./data";

export default function CartItemRow({ item, onChangeQty }: { item: CartItem; onChangeQty: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span>{item.product.name}</span>
      <button onClick={() => onChangeQty(-1)}>-</button>
      <span>{item.qty}</span>
      <button onClick={() => onChangeQty(1)}>+</button>
      <span>${(item.product.price * item.qty).toFixed(2)}</span>
    </div>
  );
}
