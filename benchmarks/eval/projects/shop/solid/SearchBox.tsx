export default function SearchBox(props: { value: string; onChange: (v: string) => void }) {
  return <input placeholder="Buscar" value={props.value} onInput={(e) => props.onChange(e.currentTarget.value)} />;
}
