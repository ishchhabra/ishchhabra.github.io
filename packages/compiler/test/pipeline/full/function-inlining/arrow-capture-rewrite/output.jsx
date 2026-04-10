function $0_0() {
  const $2_0 = getValue();
  return useMemo(() => $2_0 + 1, [getValue()]);
}
function $1_0() {
  const $27_0 = getValue();
  const $12_0 = useMemo(() => $27_0 + 1, [getValue()]);
  return <div>{useMemo(() => $27_0 + 1, [getValue()])}</div>;
}
export { $1_0 as App };
