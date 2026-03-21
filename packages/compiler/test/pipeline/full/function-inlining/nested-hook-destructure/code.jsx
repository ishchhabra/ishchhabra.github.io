function useStableLocation() {
  const { a, b } = useRouterState({
    select: (state) => ({
      a: state.a,
      b: state.b,
    }),
  });

  return useMemo(() => {
    return a ? b : null;
  }, [a, b]);
}

export function App() {
  const loc = useStableLocation();
  return <div>{loc}</div>;
}
