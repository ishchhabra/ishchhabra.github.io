const a = function a() {
  const { a: j, b: m } = useRouterState({
    select: (a) => ({
      a: a.a,
      b: a.b,
    }),
  });
  return useMemo(() => {
    let b = undefined;
    return j ? b : null;
  }, [j, m]);
};
export const App = function App() {
  const { a: u, b: x } = useRouterState({
    select: (a) => ({
      a: a.a,
      b: a.b,
    }),
  });
  const d = useMemo(() => {
    b = undefined;
    return u ? b : null;
  }, [u, x]);
  return <div>{d}</div>;
};
