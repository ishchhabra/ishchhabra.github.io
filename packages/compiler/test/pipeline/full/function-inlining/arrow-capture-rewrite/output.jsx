export function App() {
  const $26_0 = getValue();
  const $12_0 = useMemo(() => $26_0 + 1, [$26_0]);
  return <div>{$12_0}</div>;
}
