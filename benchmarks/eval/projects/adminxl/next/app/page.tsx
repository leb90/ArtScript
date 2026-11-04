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
import ShipmentsPage from "@/components/ShipmentsPage";
import PaymentsPage from "@/components/PaymentsPage";
import RefundsPage from "@/components/RefundsPage";
import BranchesPage from "@/components/BranchesPage";
import VehiclesPage from "@/components/VehiclesPage";
import ProjectsPage from "@/components/ProjectsPage";
import TicketsPage from "@/components/TicketsPage";
import CampaignsPage from "@/components/CampaignsPage";
import ContractsPage from "@/components/ContractsPage";
import AssetsPage from "@/components/AssetsPage";
import ExpensesPage from "@/components/ExpensesPage";
import SubscriptionsPage from "@/components/SubscriptionsPage";
import PartnersPage from "@/components/PartnersPage";
import EventsPage from "@/components/EventsPage";
import CoursesPage from "@/components/CoursesPage";

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
      {page === "shipments" && <ShipmentsPage />}
      {page === "payments" && <PaymentsPage />}
      {page === "refunds" && <RefundsPage />}
      {page === "branches" && <BranchesPage />}
      {page === "vehicles" && <VehiclesPage />}
      {page === "projects" && <ProjectsPage />}
      {page === "tickets" && <TicketsPage />}
      {page === "campaigns" && <CampaignsPage />}
      {page === "contracts" && <ContractsPage />}
      {page === "assets" && <AssetsPage />}
      {page === "expenses" && <ExpensesPage />}
      {page === "subscriptions" && <SubscriptionsPage />}
      {page === "partners" && <PartnersPage />}
      {page === "events" && <EventsPage />}
      {page === "courses" && <CoursesPage />}
    </div>
  );
}
