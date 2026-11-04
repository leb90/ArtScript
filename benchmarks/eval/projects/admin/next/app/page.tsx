"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import ProductsPage from "@/components/ProductsPage";
import CustomersPage from "@/components/CustomersPage";
import OrdersPage from "@/components/OrdersPage";
import SuppliersPage from "@/components/SuppliersPage";
import EmployeesPage from "@/components/EmployeesPage";
import CategoriesPage from "@/components/CategoriesPage";
import WarehousesPage from "@/components/WarehousesPage";
import InvoicesPage from "@/components/InvoicesPage";
import CouponsPage from "@/components/CouponsPage";
import ReviewsPage from "@/components/ReviewsPage";

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
