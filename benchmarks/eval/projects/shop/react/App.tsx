import { useState } from "react";
import { PRODUCTS, type CartItem, type Product } from "./data";
import Header from "./Header";
import Nav from "./Nav";
import Catalog from "./Catalog";
import CartView from "./CartView";
import Footer from "./Footer";

export default function App() {
  const [products] = useState<Product[]>(PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<"catalog" | "cart">("catalog");

  function add(product: Product) {
    const found = cart.find((i) => i.product.id === product.id);
    if (found) setCart(cart.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)));
    else setCart([...cart, { product, qty: 1 }]);
  }

  function changeQty(id: number, delta: number) {
    setCart(cart.map((i) => (i.product.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0));
  }

  const count = cart.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Header count={count} />
      <Nav tab={tab} onChange={setTab} />
      {tab === "catalog" ? (
        <Catalog products={products} onAdd={add} />
      ) : (
        <CartView cart={cart} onChangeQty={changeQty} onClear={() => setCart([])} />
      )}
      <Footer />
    </div>
  );
}
