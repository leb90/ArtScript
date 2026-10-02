import { useEffect, useState } from "react";

export default function App() {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [running]);

  function reset() {
    setRunning(false);
    setTime(0);
  }

  return (
    <div className="flex flex-col gap-2">
      <p>Tiempo: {time}</p>
      <div className="flex gap-2">
        <button onClick={() => setRunning(true)}>Iniciar</button>
        <button onClick={() => setRunning(false)}>Pausar</button>
        <button onClick={reset}>Reiniciar</button>
      </div>
    </div>
  );
}
