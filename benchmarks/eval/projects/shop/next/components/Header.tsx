export default function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Tienda</h1>
      <span className="text-gray-500">Carrito ({count})</span>
    </div>
  );
}
