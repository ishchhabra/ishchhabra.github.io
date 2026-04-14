function $0_0() {
  const $2_0 = getValue();
  return useMemo(() => $2_0 + 1, [$2_0]);
}
function $1_0() {
  return <div>{$0_0()}</div>;
}
export { $1_0 as App };
