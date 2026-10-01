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
  </div>
</template>
