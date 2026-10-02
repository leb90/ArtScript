import { createSignal, onCleanup } from "solid-js";

export default function App() {
  const [time, setTime] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  function start() {
    if (timer) return;
    timer = setInterval(() => setTime((t) => t + 1), 100);
  }
  function pause() {
    clearInterval(timer);
    timer = undefined;
  }
  function reset() {
    pause();
    setTime(0);
  }
  onCleanup(pause);

  return (
    <div class="flex flex-col gap-2">
      <p>Tiempo: {time()}</p>
      <div class="flex gap-2">
        <button onClick={start}>Iniciar</button>
        <button onClick={pause}>Pausar</button>
        <button onClick={reset}>Reiniciar</button>
      </div>
    </div>
  );
}
