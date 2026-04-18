function $0() {
  const { a: $2, b: $3 } = useRouterState({
    select: ($6) => ({
      a: $6.a,
      b: $6.b,
    }),
  });
  return useMemo(() => {
    let $27 = undefined;
    return $2 ? $3 : null;
  }, [$2, $3]);
}
function $1() {
  return <div>{$0()}</div>;
}
export { $1 as App };
