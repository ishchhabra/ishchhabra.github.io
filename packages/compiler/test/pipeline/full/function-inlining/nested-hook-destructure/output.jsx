function $0_0() {
  const { a: $3_0, b: $4_0 } = useRouterState({
    select: ($12_0) => ({
      a: $12_0.a,
      b: $12_0.b,
    }),
  });
  return useMemo(() => {
    return $3_0 ? $4_0 : null;
  }, [$3_0, $4_0]);
}
export function App() {
  const { a: $49_0, b: $52_0 } = useRouterState({
    select: ($12_0) => ({
      a: $12_0.a,
      b: $12_0.b,
    }),
  });
  const $31_0 = useMemo(() => {
    return $49_0 ? $52_0 : null;
  }, [$49_0, $52_0]);
  return <div>{$31_0}</div>;
}
