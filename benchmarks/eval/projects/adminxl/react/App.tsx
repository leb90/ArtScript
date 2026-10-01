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
import ShipmentsPage from "./ShipmentsPage";
import PaymentsPage from "./PaymentsPage";
import RefundsPage from "./RefundsPage";
import BranchesPage from "./BranchesPage";
import VehiclesPage from "./VehiclesPage";
import ProjectsPage from "./ProjectsPage";
import TicketsPage from "./TicketsPage";
import CampaignsPage from "./CampaignsPage";
import ContractsPage from "./ContractsPage";
import AssetsPage from "./AssetsPage";
import ExpensesPage from "./ExpensesPage";
import SubscriptionsPage from "./SubscriptionsPage";
import PartnersPage from "./PartnersPage";
import EventsPage from "./EventsPage";
import CoursesPage from "./CoursesPage";

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
