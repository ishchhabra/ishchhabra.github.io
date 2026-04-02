export function App() {
  useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const $32_0 = useMemo(() => {
    return $53_0 ? $56_0 : null;
  }, [$53_0, $56_0]);
  return <div>{$32_0}</div>;
}
