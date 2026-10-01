import type { CartItem } from "./data";
import CartItemRow from "./CartItemRow";
import Summary from "./Summary";

type Props = { cart: CartItem[]; onChangeQty: (id: number, delta: number) => void; onClear: () => void };

export default function CartView({ cart, onChangeQty, onClear }: Props) {
  if (cart.length === 0) return <span className="text-gray-500">El carrito está vacío</span>;
  return (
    <div className="flex flex-col gap-2">
      {cart.map((item) => (
        <CartItemRow key={item.product.id} item={item} onChangeQty={(d) => onChangeQty(item.product.id, d)} />
      ))}
      <Summary cart={cart} onClear={onClear} />
    </div>
  );
}
