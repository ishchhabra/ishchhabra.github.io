function $0_0() {
  const { a: $2_0, b: $3_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  return useMemo(() => {
    return $2_0 ? $3_0 : null;
  }, [$2_0, $3_0]);
}
function $1_0() {
  const { a: $57_0, b: $58_0 } = useRouterState({
    select: ($6_0) => ({
      a: $6_0.a,
      b: $6_0.b,
    }),
  });
  return (
    <div>
      {useMemo(() => {
        return $57_0 ? $58_0 : null;
      }, [$57_0, $58_0])}
    </div>
  );
}
export { $1_0 as App };
