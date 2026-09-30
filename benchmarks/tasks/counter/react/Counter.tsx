import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  const double = count * 2;

  return (
    <div className="flex flex-col gap-4 items-center">
      <h2>Contador</h2>
      <div className="flex items-center gap-2">
        <button onClick={() => setCount(count - 1)}>-</button>
        <span className="font-semibold">{count}</span>
        <button className="primary" onClick={() => setCount(count + 1)}>+</button>
      </div>
      <span className="text-gray-500">El doble es {double}</span>
      {count > 5 && <span>¡Más de 5!</span>}
    </div>
  );
}
