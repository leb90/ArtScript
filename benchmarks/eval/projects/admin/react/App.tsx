import { useState } from "react";
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
  const [page, setPage] = useState("products");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Panel</h1>
      <Nav page={page} onChange={setPage} />
      {page === "products" && <ProductsPage />}
      {page === "customers" && <CustomersPage />}
      {page === "orders" && <OrdersPage />}
      {page === "suppliers" && <SuppliersPage />}
      {page === "employees" && <EmployeesPage />}
      {page === "categories" && <CategoriesPage />}
      {page === "warehouses" && <WarehousesPage />}
      {page === "invoices" && <InvoicesPage />}
      {page === "coupons" && <CouponsPage />}
      {page === "reviews" && <ReviewsPage />}
    </div>
  );
}
