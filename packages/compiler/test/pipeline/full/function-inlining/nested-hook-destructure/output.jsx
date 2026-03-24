export function App() {
  const { a: $46_0, b: $49_0 } = useRouterState({
    select: ($12_0) => ({
      a: $12_0.a,
      b: $12_0.b,
    }),
  });
  const $31_0 = useMemo(() => {
    return $46_0 ? $49_0 : null;
  }, [$46_0, $49_0]);
  return <div>{$31_0}</div>;
}
