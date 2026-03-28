export function App() {
  const $24_0 = getValue();
  const $12_0 = useMemo(() => $24_0 + 1, [$24_0]);
  return <div>{$12_0}</div>;
}
