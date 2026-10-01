export default function Header(props: { count: number }) {
  return (
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Tienda</h1>
      <span class="text-gray-500">Carrito ({props.count})</span>
    </div>
  );
}
