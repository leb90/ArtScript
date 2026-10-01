const SECTIONS = [{"key":"products","label":"Productos"},{"key":"customers","label":"Clientes"},{"key":"orders","label":"Pedidos"},{"key":"suppliers","label":"Proveedores"},{"key":"employees","label":"Empleados"},{"key":"categories","label":"Categorías"},{"key":"warehouses","label":"Depósitos"},{"key":"invoices","label":"Facturas"},{"key":"coupons","label":"Cupones"},{"key":"reviews","label":"Reseñas"},{"key":"shipments","label":"Envíos"},{"key":"payments","label":"Pagos"},{"key":"refunds","label":"Devoluciones"},{"key":"branches","label":"Sucursales"},{"key":"vehicles","label":"Vehículos"},{"key":"projects","label":"Proyectos"},{"key":"tickets","label":"Tickets"},{"key":"campaigns","label":"Campañas"},{"key":"contracts","label":"Contratos"},{"key":"assets","label":"Activos"},{"key":"expenses","label":"Gastos"},{"key":"subscriptions","label":"Suscripciones"},{"key":"partners","label":"Socios"},{"key":"events","label":"Eventos"},{"key":"courses","label":"Cursos"}];

export default function Nav({ page, onChange }: { page: string; onChange: (page: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <button key={s.key} className={page === s.key ? "font-bold" : ""} onClick={() => onChange(s.key)}>{s.label}</button>
      ))}
    </div>
  );
}
