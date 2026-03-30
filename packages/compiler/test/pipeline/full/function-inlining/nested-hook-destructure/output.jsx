export function App() {
  const { a: $51_0, b: $54_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const $30_0 = useMemo(() => {
    return $51_0 ? $54_0 : null;
  }, [$51_0, $54_0]);
  return <div>{$30_0}</div>;
}
