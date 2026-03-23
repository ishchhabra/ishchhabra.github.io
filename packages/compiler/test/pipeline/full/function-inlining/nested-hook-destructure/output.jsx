function $0_0() {
  const { a: $3_0, b: $4_0 } = useRouterState({
    select: ($12_0) => ({
      a: $12_0.a,
      b: $12_0.b,
    }),
  });
  return useMemo(() => {
    const $26_2 = null;
    const $43_phi_62 = $3_0 ? $4_0 : $26_2;
    return $43_phi_62;
  }, [$3_0, $4_0]);
}
export function App() {
  const { a: $53_0, b: $56_0 } = useRouterState({
    select: ($12_0) => ({
      a: $12_0.a,
      b: $12_0.b,
    }),
  });
  const $31_0 = useMemo(() => {
    const $26_2 = null;
    const $43_phi_62 = $53_0 ? $56_0 : $26_2;
    return $43_phi_62;
  }, [$53_0, $56_0]);
  return <div>{$31_0}</div>;
}
