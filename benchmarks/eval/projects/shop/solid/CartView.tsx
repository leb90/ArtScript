import { For, Show } from "solid-js";
import type { CartItem } from "./data";
import CartItemRow from "./CartItemRow";
import Summary from "./Summary";

type Props = { cart: CartItem[]; onChangeQty: (id: number, delta: number) => void; onClear: () => void };

export default function CartView(props: Props) {
  return (
    <Show when={props.cart.length > 0} fallback={<span class="text-gray-500">El carrito está vacío</span>}>
      <div class="flex flex-col gap-2">
        <For each={props.cart}>{(item) => <CartItemRow item={item} onChangeQty={(d) => props.onChangeQty(item.product.id, d)} />}</For>
        <Summary cart={props.cart} onClear={props.onClear} />
      </div>
    </Show>
  );
}
