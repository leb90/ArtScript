import { createSignal, Match, Switch } from "solid-js";
import Nav from "./Nav";
import ProductsPage from "./ProductsPage";
import CustomersPage from "./CustomersPage";
import OrdersPage from "./OrdersPage";
import SuppliersPage from "./SuppliersPage";
import EmployeesPage from "./EmployeesPage";
import CategoriesPage from "./CategoriesPage";
import WarehousesPage from "./WarehousesPage";
import InvoicesPage from "./InvoicesPage";
import CouponsPage from "./CouponsPage";
import ReviewsPage from "./ReviewsPage";

export default function App() {
  const [page, setPage] = createSignal("products");

  return (
    <div class="flex flex-col gap-4 p-4">
      <h1 class="text-2xl font-bold">Panel</h1>
      <Nav page={page()} onChange={setPage} />
      <Switch>
        <Match when={page() === "products"}>
          <ProductsPage />
        </Match>
        <Match when={page() === "customers"}>
          <CustomersPage />
        </Match>
        <Match when={page() === "orders"}>
          <OrdersPage />
        </Match>
        <Match when={page() === "suppliers"}>
          <SuppliersPage />
        </Match>
        <Match when={page() === "employees"}>
          <EmployeesPage />
        </Match>
        <Match when={page() === "categories"}>
          <CategoriesPage />
        </Match>
        <Match when={page() === "warehouses"}>
          <WarehousesPage />
        </Match>
        <Match when={page() === "invoices"}>
          <InvoicesPage />
        </Match>
        <Match when={page() === "coupons"}>
          <CouponsPage />
        </Match>
        <Match when={page() === "reviews"}>
          <ReviewsPage />
        </Match>
      </Switch>
    </div>
  );
}
