const a = function a() {
  const b = getValue();
  return useMemo(() => b + 1, [b]);
};
export const App = function App() {
  const $27_0 = getValue();
  const b = useMemo(() => $27_0 + 1, [$27_0]);
  return <div>{b}</div>;
};
