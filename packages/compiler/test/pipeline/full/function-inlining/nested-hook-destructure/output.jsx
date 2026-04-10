function $0_0() {
  const { a, b } = useRouterState({
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
  const { a: $56_0, b: $57_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const loc = useMemo(() => {
    return $56_0 ? $57_0 : null;
  }, [$56_0, $57_0]);
  return (
    <div>
      {useMemo(() => {
        return $56_0 ? $57_0 : null;
      }, [$56_0, $57_0])}
    </div>
  );
}
