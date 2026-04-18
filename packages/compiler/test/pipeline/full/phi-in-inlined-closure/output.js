function $0() {
  return $1();
}
function $1() {
  const $8 = globalThis.getA();
  const $9 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $28 = undefined;
    if ($8) {
      const $43 = $9 ?? "default";
      $28 = $43;
    } else {
      $28 = "fallback";
    }
    return $28;
  }, [$8, $9]);
}
export { $0 as Component };
