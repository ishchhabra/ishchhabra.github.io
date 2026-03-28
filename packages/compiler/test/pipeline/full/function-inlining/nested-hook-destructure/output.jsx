export function App() {
  const { a: $45_0, b: $48_0 } = useRouterState({
    select: ($11_0) => ({
      a: $11_0.a,
      b: $11_0.b,
    }),
  });
  const $30_0 = useMemo(() => {
    return $45_0 ? $48_0 : null;
  }, [$45_0, $48_0]);
  return <div>{$30_0}</div>;
}
