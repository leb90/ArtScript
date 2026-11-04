export default function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input placeholder="Buscar" value={value} onChange={(e) => onChange(e.target.value)} />;
}
