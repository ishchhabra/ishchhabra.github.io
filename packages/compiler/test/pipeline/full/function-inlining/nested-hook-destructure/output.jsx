const $0_0 = function $0_0() {
  const { a: a, b: b } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  return useMemo(() => {
    return a ? b : null;
  }, [a, b]);
};
export const App = function App() {
  const { a: $54_0, b: $57_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const loc = useMemo(() => {
    return $54_0 ? $57_0 : null;
  }, [$54_0, $57_0]);
  return <div>{loc}</div>;
};
