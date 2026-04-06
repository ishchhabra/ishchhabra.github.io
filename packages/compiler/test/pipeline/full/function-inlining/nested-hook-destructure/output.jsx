const a = function a() {
  const { a: c, b: d } = useRouterState({
    select: (a) => ({
      a: a.a,
      b: a.b,
    }),
  });
  return useMemo(() => {
    return c ? d : null;
  }, [c, d]);
};
export const App = function App() {
  const { a: $54_0, b: $57_0 } = useRouterState({
    select: (a) => ({
      a: a.a,
      b: a.b,
    }),
  });
  const b = useMemo(() => {
    return $54_0 ? $57_0 : null;
  }, [$54_0, $57_0]);
  return <div>{b}</div>;
};
