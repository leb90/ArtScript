import { useEffect, useState } from "react";

const toBase64 = (file: File) => new Promise<string>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.readAsDataURL(file);
});

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const load = async () => setUrl((await (await fetch("/api/avatar")).json())?.url ?? null);
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!file) return;
    await fetch("/api/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: file.type, data: await toBase64(file) }) });
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={upload}>Subir</button>
      {url && <img src={url} alt="Foto de perfil" />}
    </div>
  );
}
