function $0_0() {
  const x = getValue();
  return useMemo(() => x + 1, [x]);
}
export function App() {
  const $25_0 = getValue();
  const result = useMemo(() => $25_0 + 1, [$25_0]);
  return <div>{result}</div>;
}
