function $0() {
  const { a: $2, b: $3 } = useRouterState({
    select: ($7) => ({
      a: $7.a,
      b: $7.b,
    }),
  });
  return useMemo(() => {
    let $24;
    if ($2) {
      $24 = $3;
    } else {
      $24 = null;
    }
    return $24;
  }, [$2, $3]);
}
function $1() {
  return <div>{$0()}</div>;
}
export { $1 as App };
