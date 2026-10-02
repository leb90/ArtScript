import { useState } from "react";

export default function App() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("Gratis");
  const [news, setNews] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function next() {
    if (step === 1 && !name.trim()) {
      setError("Nombre requerido");
      return;
    }
    setError("");
    setStep(step + 1);
  }

  if (done) return <p>¡Listo, {name}!</p>;

  return (
    <div className="flex flex-col gap-2">
      <p>Paso {step} de 3</p>
      {step === 1 && (
        <>
          <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <span>{error}</span>}
          <button onClick={next}>Siguiente</button>
        </>
      )}
      {step === 2 && (
        <>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option>Gratis</option>
            <option>Pro</option>
          </select>
          <label>
            <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
            Recibir novedades
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)}>Atrás</button>
            <button onClick={next}>Siguiente</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p>{name} eligió {plan}</p>
          {news && <p>Con novedades</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep(2)}>Atrás</button>
            <button onClick={() => setDone(true)}>Confirmar</button>
          </div>
        </>
      )}
    </div>
  );
}
