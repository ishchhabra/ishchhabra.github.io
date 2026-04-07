function $0_0() {
  const { a: a, b: b } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  return useMemo(() => {
    return a ? b : null;
  }, [a, b]);
}
export function App() {
  const { a: $52_0, b: $55_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const loc = useMemo(() => {
    return $52_0 ? $55_0 : null;
  }, [$52_0, $55_0]);
  return <div>{loc}</div>;
}
