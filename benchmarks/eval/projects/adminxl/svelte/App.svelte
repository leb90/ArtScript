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
  import ShipmentsPage from "./ShipmentsPage.svelte";
  import PaymentsPage from "./PaymentsPage.svelte";
  import RefundsPage from "./RefundsPage.svelte";
  import BranchesPage from "./BranchesPage.svelte";
  import VehiclesPage from "./VehiclesPage.svelte";
  import ProjectsPage from "./ProjectsPage.svelte";
  import TicketsPage from "./TicketsPage.svelte";
  import CampaignsPage from "./CampaignsPage.svelte";
  import ContractsPage from "./ContractsPage.svelte";
  import AssetsPage from "./AssetsPage.svelte";
  import ExpensesPage from "./ExpensesPage.svelte";
  import SubscriptionsPage from "./SubscriptionsPage.svelte";
  import PartnersPage from "./PartnersPage.svelte";
  import EventsPage from "./EventsPage.svelte";
  import CoursesPage from "./CoursesPage.svelte";

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
  {:else if page === "shipments"}
    <ShipmentsPage />
  {:else if page === "payments"}
    <PaymentsPage />
  {:else if page === "refunds"}
    <RefundsPage />
  {:else if page === "branches"}
    <BranchesPage />
  {:else if page === "vehicles"}
    <VehiclesPage />
  {:else if page === "projects"}
    <ProjectsPage />
  {:else if page === "tickets"}
    <TicketsPage />
  {:else if page === "campaigns"}
    <CampaignsPage />
  {:else if page === "contracts"}
    <ContractsPage />
  {:else if page === "assets"}
    <AssetsPage />
  {:else if page === "expenses"}
    <ExpensesPage />
  {:else if page === "subscriptions"}
    <SubscriptionsPage />
  {:else if page === "partners"}
    <PartnersPage />
  {:else if page === "events"}
    <EventsPage />
  {:else if page === "courses"}
    <CoursesPage />
  {/if}
</div>
