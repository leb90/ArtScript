const SECTIONS = [{"key":"products","label":"Productos"},{"key":"customers","label":"Clientes"},{"key":"orders","label":"Pedidos"},{"key":"suppliers","label":"Proveedores"},{"key":"employees","label":"Empleados"},{"key":"categories","label":"Categorías"},{"key":"warehouses","label":"Depósitos"},{"key":"invoices","label":"Facturas"},{"key":"coupons","label":"Cupones"},{"key":"reviews","label":"Reseñas"}];

export default function Nav({ page, onChange }: { page: string; onChange: (page: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <button key={s.key} className={page === s.key ? "font-bold" : ""} onClick={() => onChange(s.key)}>{s.label}</button>
      ))}
    </div>
  );
}
