<script setup lang="ts">
import { ref } from "vue";
import Nav from "./Nav.vue";
import ProductsPage from "./ProductsPage.vue";
import CustomersPage from "./CustomersPage.vue";
import OrdersPage from "./OrdersPage.vue";
import SuppliersPage from "./SuppliersPage.vue";
import EmployeesPage from "./EmployeesPage.vue";
import CategoriesPage from "./CategoriesPage.vue";
import WarehousesPage from "./WarehousesPage.vue";
import InvoicesPage from "./InvoicesPage.vue";
import CouponsPage from "./CouponsPage.vue";
import ReviewsPage from "./ReviewsPage.vue";
import ShipmentsPage from "./ShipmentsPage.vue";
import PaymentsPage from "./PaymentsPage.vue";
import RefundsPage from "./RefundsPage.vue";
import BranchesPage from "./BranchesPage.vue";
import VehiclesPage from "./VehiclesPage.vue";
import ProjectsPage from "./ProjectsPage.vue";
import TicketsPage from "./TicketsPage.vue";
import CampaignsPage from "./CampaignsPage.vue";
import ContractsPage from "./ContractsPage.vue";
import AssetsPage from "./AssetsPage.vue";
import ExpensesPage from "./ExpensesPage.vue";
import SubscriptionsPage from "./SubscriptionsPage.vue";
import PartnersPage from "./PartnersPage.vue";
import EventsPage from "./EventsPage.vue";
import CoursesPage from "./CoursesPage.vue";

const page = ref("products");
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <h1 class="text-2xl font-bold">Panel</h1>
    <Nav :page="page" @change="(p) => (page = p)" />
    <ProductsPage v-if="page === 'products'" />
    <CustomersPage v-else-if="page === 'customers'" />
    <OrdersPage v-else-if="page === 'orders'" />
    <SuppliersPage v-else-if="page === 'suppliers'" />
    <EmployeesPage v-else-if="page === 'employees'" />
    <CategoriesPage v-else-if="page === 'categories'" />
    <WarehousesPage v-else-if="page === 'warehouses'" />
    <InvoicesPage v-else-if="page === 'invoices'" />
    <CouponsPage v-else-if="page === 'coupons'" />
    <ReviewsPage v-else-if="page === 'reviews'" />
    <ShipmentsPage v-else-if="page === 'shipments'" />
    <PaymentsPage v-else-if="page === 'payments'" />
    <RefundsPage v-else-if="page === 'refunds'" />
    <BranchesPage v-else-if="page === 'branches'" />
    <VehiclesPage v-else-if="page === 'vehicles'" />
    <ProjectsPage v-else-if="page === 'projects'" />
    <TicketsPage v-else-if="page === 'tickets'" />
    <CampaignsPage v-else-if="page === 'campaigns'" />
    <ContractsPage v-else-if="page === 'contracts'" />
    <AssetsPage v-else-if="page === 'assets'" />
    <ExpensesPage v-else-if="page === 'expenses'" />
    <SubscriptionsPage v-else-if="page === 'subscriptions'" />
    <PartnersPage v-else-if="page === 'partners'" />
    <EventsPage v-else-if="page === 'events'" />
    <CoursesPage v-else-if="page === 'courses'" />
  </div>
</template>
