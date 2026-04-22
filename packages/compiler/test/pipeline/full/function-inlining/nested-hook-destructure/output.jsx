function $0() {
  const { a: $2, b: $3 } = useRouterState({
    select: ($6) => ({
      a: $6.a,
      b: $6.b,
    }),
  });
  return useMemo(() => {
    let $24 = undefined;
    if ($2) {
      $24 = undefined;
    } else {
      $24 = undefined;
    }
    return $24;
  }, [$2, $3]);
}
function $1() {
  return <div>{$0()}</div>;
}
export { $1 as App };
