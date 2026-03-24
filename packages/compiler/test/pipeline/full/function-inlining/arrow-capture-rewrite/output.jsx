export function App() {
  const $28_0 = getValue();
  const $13_0 = useMemo(() => $28_0 + 1, [$28_0]);
  return <div>{$13_0}</div>;
}
