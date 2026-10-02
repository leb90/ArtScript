import { createSignal, Match, Show, Switch } from "solid-js";

export default function App() {
  const [step, setStep] = createSignal(1);
  const [name, setName] = createSignal("");
  const [plan, setPlan] = createSignal("Gratis");
  const [news, setNews] = createSignal(false);
  const [error, setError] = createSignal("");
  const [done, setDone] = createSignal(false);

  function next() {
    if (step() === 1 && !name().trim()) {
      setError("Nombre requerido");
      return;
    }
    setError("");
    setStep(step() + 1);
  }
  const back = () => setStep(step() - 1);

  return (
    <Show when={!done()} fallback={<h1>¡Listo, {name()}!</h1>}>
      <div class="flex flex-col gap-2">
        <p>Paso {step()} de 3</p>
        <Switch>
          <Match when={step() === 1}>
            <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            <Show when={error()}>
              <span>{error()}</span>
            </Show>
            <button onClick={next}>Siguiente</button>
          </Match>
          <Match when={step() === 2}>
            <select value={plan()} onChange={(e) => setPlan(e.currentTarget.value)}>
              <option>Gratis</option>
              <option>Pro</option>
            </select>
            <label>
              <input type="checkbox" checked={news()} onChange={(e) => setNews(e.currentTarget.checked)} />
              Recibir novedades
            </label>
            <div class="flex gap-2">
              <button onClick={back}>Atrás</button>
              <button onClick={next}>Siguiente</button>
            </div>
          </Match>
          <Match when={step() === 3}>
            <p>{name()} eligió {plan()}</p>
            <Show when={news()}>
              <p>Con novedades</p>
            </Show>
            <div class="flex gap-2">
              <button onClick={back}>Atrás</button>
              <button onClick={() => setDone(true)}>Confirmar</button>
            </div>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}
