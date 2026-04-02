export function App() {
  useRouterState({
    select: ($5_0) => ({
      a: $5_0.a,
      b: $5_0.b,
    }),
  });
  const $32_0 = useMemo(() => {
    return $53_0 ? $56_0 : null;
  }, [$53_0, $56_0]);
  return <div>{$32_0}</div>;
}
