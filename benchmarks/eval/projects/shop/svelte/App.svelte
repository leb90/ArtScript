<script lang="ts">
  import { PRODUCTS, type CartItem, type Product } from "./data";
  import Header from "./Header.svelte";
  import Nav from "./Nav.svelte";
  import Catalog from "./Catalog.svelte";
  import CartView from "./CartView.svelte";
  import Footer from "./Footer.svelte";

  let products = $state<Product[]>(PRODUCTS.map((p) => ({ ...p })));
  let cart = $state<CartItem[]>([]);
  let tab = $state<"catalog" | "cart">("catalog");
  let count = $derived(cart.reduce((n, i) => n + i.qty, 0));

  function add(product: Product) {
    const found = cart.find((i) => i.product.id === product.id);
    if (found) found.qty++;
    else cart.push({ product, qty: 1 });
  }

  function changeQty(id: number, delta: number) {
    cart = cart.map((i) => (i.product.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0);
  }
</script>

<div class="flex flex-col gap-4 p-4">
  <Header {count} />
  <Nav {tab} onChange={(t) => (tab = t)} />
  {#if tab === "catalog"}
    <Catalog {products} onAdd={add} />
  {:else}
    <CartView {cart} onChangeQty={changeQty} onClear={() => (cart = [])} />
  {/if}
  <Footer />
</div>
