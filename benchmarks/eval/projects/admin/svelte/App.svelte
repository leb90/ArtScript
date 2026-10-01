<script lang="ts">
  import Nav from "./Nav.svelte";
  import ProductsPage from "./ProductsPage.svelte";
  import CustomersPage from "./CustomersPage.svelte";
  import OrdersPage from "./OrdersPage.svelte";
  import SuppliersPage from "./SuppliersPage.svelte";
  import EmployeesPage from "./EmployeesPage.svelte";
  import CategoriesPage from "./CategoriesPage.svelte";
  import WarehousesPage from "./WarehousesPage.svelte";
  import InvoicesPage from "./InvoicesPage.svelte";
  import CouponsPage from "./CouponsPage.svelte";
  import ReviewsPage from "./ReviewsPage.svelte";

  let page = $state("products");
</script>

<div class="flex flex-col gap-4 p-4">
  <h1 class="text-2xl font-bold">Panel</h1>
  <Nav {page} onChange={(p) => (page = p)} />
  {#if page === "products"}
    <ProductsPage />
  {:else if page === "customers"}
    <CustomersPage />
  {:else if page === "orders"}
    <OrdersPage />
  {:else if page === "suppliers"}
    <SuppliersPage />
  {:else if page === "employees"}
    <EmployeesPage />
  {:else if page === "categories"}
    <CategoriesPage />
  {:else if page === "warehouses"}
    <WarehousesPage />
  {:else if page === "invoices"}
    <InvoicesPage />
  {:else if page === "coupons"}
    <CouponsPage />
  {:else if page === "reviews"}
    <ReviewsPage />
  {/if}
</div>
