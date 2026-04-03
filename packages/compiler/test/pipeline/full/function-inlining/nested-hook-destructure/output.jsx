export const App = function App() {
  const { a: $55_0, b: $58_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  const $33_0 = useMemo(() => {
    return $55_0 ? $58_0 : null;
  }, [$55_0, $58_0]);
  return <div>{$33_0}</div>;
};
