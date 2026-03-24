export function App() {
  const $25_0 = getValue();
  const $13_0 = useMemo(() => $25_0 + 1, [$25_0]);
  return <div>{$13_0}</div>;
}
