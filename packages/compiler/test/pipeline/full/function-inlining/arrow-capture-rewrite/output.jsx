function $0_0() {
  const x = getValue();
  return useMemo(() => x + 1, [getValue()]);
}
export function App() {
  const x = getValue();
  const result = useMemo(() => x + 1, [getValue()]);
  return <div>{useMemo(() => x + 1, [getValue()])}</div>;
}
