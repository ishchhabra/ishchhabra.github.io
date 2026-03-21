function useValue() {
  const x = getValue();
  return useMemo(() => x + 1, [x]);
}

export function App() {
  const result = useValue();
  return <div>{result}</div>;
}
