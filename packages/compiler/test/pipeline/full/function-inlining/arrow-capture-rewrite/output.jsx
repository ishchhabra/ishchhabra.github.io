const $0_0 = function $0_0() {
  const x = getValue();
  return useMemo(() => x + 1, [x]);
};
export const App = function App() {
  const $27_0 = getValue();
  const result = useMemo(() => $27_0 + 1, [$27_0]);
  return <div>{result}</div>;
};
