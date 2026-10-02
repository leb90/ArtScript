<script lang="ts">
  let file = $state<File | null>(null);
  let url = $state<string | null>(null);

  const toBase64 = (f: File) => new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(f);
  });

  async function load() {
    url = (await (await fetch("/api/avatar")).json())?.url ?? null;
  }
  load();

  async function upload() {
    if (!file) return;
    await fetch("/api/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: file.type, data: await toBase64(file) }) });
    await load();
  }
</script>

<div class="flex flex-col gap-3">
  <input type="file" accept="image/*" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} />
  <button onclick={upload}>Subir</button>
  {#if url}<img src={url} alt="Foto de perfil" />{/if}
</div>
