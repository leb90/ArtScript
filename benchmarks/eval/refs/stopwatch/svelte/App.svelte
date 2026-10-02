<script lang="ts">
  import { onDestroy } from "svelte";

  let time = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  function start() {
    if (timer) return;
    timer = setInterval(() => time++, 100);
  }

  function pause() {
    clearInterval(timer);
    timer = undefined;
  }

  function reset() {
    pause();
    time = 0;
  }

  onDestroy(pause);
</script>

<div class="flex flex-col gap-2">
  <p>Tiempo: {time}</p>
  <div class="flex gap-2">
    <button onclick={start}>Iniciar</button>
    <button onclick={pause}>Pausar</button>
    <button onclick={reset}>Reiniciar</button>
  </div>
</div>
