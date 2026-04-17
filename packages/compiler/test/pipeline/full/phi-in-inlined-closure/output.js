function $0_0() {
  return $1_0();
}
function $1_0() {
  const $7_0 = globalThis.getA();
  const $8_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $25_0 = undefined;
    if ($7_0) {
      const $37_0 = $8_0 ?? "default";
      $25_0 = $8_0 ?? "default";
    } else {
      $25_0 = "fallback";
    }
    return $25_0;
  }, [$7_0, $8_0]);
}
export { $0_0 as Component };
