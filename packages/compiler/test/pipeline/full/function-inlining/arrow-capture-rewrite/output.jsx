const a = function a() {
  const d = getValue();
  return useMemo(() => d + 1, [d]);
};
export const App = function App() {
  const p = getValue();
  const d = useMemo(() => p + 1, [p]);
  return <div>{d}</div>;
};
