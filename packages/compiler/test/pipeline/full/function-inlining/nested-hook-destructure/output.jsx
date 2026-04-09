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
  const { a, b } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const loc = useMemo(() => {
    return a ? b : null;
  }, [a, b]);
  return (
    <div>
      {useMemo(() => {
        return a ? b : null;
      }, [a, b])}
    </div>
  );
}
