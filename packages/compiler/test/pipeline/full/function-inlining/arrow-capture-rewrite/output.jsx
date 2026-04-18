function $0() {
  const $2 = getValue();
  return useMemo(() => $2 + 1, [$2]);
}
function $1() {
  return <div>{$0()}</div>;
}
export { $1 as App };
