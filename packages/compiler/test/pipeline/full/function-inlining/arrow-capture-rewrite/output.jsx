function $0_0() {
  const x = getValue();
  return useMemo(() => x + 1, [getValue()]);
}
export function App() {
  const $26_0 = getValue();
  const result = useMemo(() => $26_0 + 1, [getValue()]);
  return <div>{useMemo(() => $26_0 + 1, [getValue()])}</div>;
}
