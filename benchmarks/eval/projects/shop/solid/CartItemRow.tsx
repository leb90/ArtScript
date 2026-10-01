import type { CartItem } from "./data";

export default function CartItemRow(props: { item: CartItem; onChangeQty: (delta: number) => void }) {
  return (
    <div class="flex items-center gap-2">
      <span>{props.item.product.name}</span>
      <button onClick={() => props.onChangeQty(-1)}>-</button>
      <span>{props.item.qty}</span>
      <button onClick={() => props.onChangeQty(1)}>+</button>
      <span>${(props.item.product.price * props.item.qty).toFixed(2)}</span>
    </div>
  );
}
