function $0_0() {
  return $1_0();
}
function $1_0() {
  const $7_0 = globalThis.getA();
  const $8_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    return $7_0 ? ($8_0 ?? "default") : "fallback";
  }, [$7_0, $8_0]);
}
export { $0_0 as Component };
