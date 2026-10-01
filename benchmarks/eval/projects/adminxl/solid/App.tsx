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
        <Match when={page() === "shipments"}>
          <ShipmentsPage />
        </Match>
        <Match when={page() === "payments"}>
          <PaymentsPage />
        </Match>
        <Match when={page() === "refunds"}>
          <RefundsPage />
        </Match>
        <Match when={page() === "branches"}>
          <BranchesPage />
        </Match>
        <Match when={page() === "vehicles"}>
          <VehiclesPage />
        </Match>
        <Match when={page() === "projects"}>
          <ProjectsPage />
        </Match>
        <Match when={page() === "tickets"}>
          <TicketsPage />
        </Match>
        <Match when={page() === "campaigns"}>
          <CampaignsPage />
        </Match>
        <Match when={page() === "contracts"}>
          <ContractsPage />
        </Match>
        <Match when={page() === "assets"}>
          <AssetsPage />
        </Match>
        <Match when={page() === "expenses"}>
          <ExpensesPage />
        </Match>
        <Match when={page() === "subscriptions"}>
          <SubscriptionsPage />
        </Match>
        <Match when={page() === "partners"}>
          <PartnersPage />
        </Match>
        <Match when={page() === "events"}>
          <EventsPage />
        </Match>
        <Match when={page() === "courses"}>
          <CoursesPage />
        </Match>
      </Switch>
    </div>
  );
}
