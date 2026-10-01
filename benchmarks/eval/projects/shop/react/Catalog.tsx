import { useState } from "react";
import type { Product } from "./data";
import SearchBox from "./SearchBox";
import ProductCard from "./ProductCard";

export default function Catalog({ products, onAdd }: { products: Product[]; onAdd: (p: Product) => void }) {
  const [query, setQuery] = useState("");
  const shown = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={query} onChange={setQuery} />
      <div className="grid grid-cols-3 gap-2">
        {shown.map((p) => (
          <ProductCard key={p.id} product={p} onAdd={() => onAdd(p)} />
        ))}
      </div>
      {shown.length === 0 && <span className="text-gray-500">Sin resultados</span>}
    </div>
  );
}
