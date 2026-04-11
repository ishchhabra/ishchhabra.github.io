function $0_0() {
  const $36_0 = globalThis.getA();
  const $41_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    return $36_0 ? ($41_0 ?? "default") : "fallback";
  }, [$36_0, $41_0]);
}
function $1_0() {
  const $5_0 = globalThis.getA();
  const $6_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    return $5_0 ? ($6_0 ?? "default") : "fallback";
  }, [$5_0, $6_0]);
}
export { $0_0 as Component };
