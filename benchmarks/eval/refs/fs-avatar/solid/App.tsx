import { createResource, createSignal, Show } from "solid-js";

const toBase64 = (f: File) => new Promise<string>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.readAsDataURL(f);
});

export default function App() {
  const [file, setFile] = createSignal<File | null>(null);
  const [avatar, { refetch }] = createResource<{ url: string } | null>(async () => (await fetch("/api/avatar")).json());

  async function upload() {
    const f = file();
    if (!f) return;
    await fetch("/api/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: f.type, data: await toBase64(f) }) });
    refetch();
  }

  return (
    <div class="flex flex-col gap-3">
      <input type="file" accept="image/*" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
      <button onClick={upload}>Subir</button>
      <Show when={avatar()?.url}>{(u) => <img src={u()} alt="Foto de perfil" />}</Show>
    </div>
  );
}
