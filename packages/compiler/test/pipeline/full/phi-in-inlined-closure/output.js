function $0() {
  return $1();
}
function $1() {
  const $10 = globalThis.getA();
  const $11 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $28;
    let $33;
    if ($10) {
      const $53 = $11;
      if ($53 != null) {
        $33 = $53;
      } else {
        $33 = "default";
      }
      $28 = $33;
    } else {
      $28 = "fallback";
    }
    return $28;
  }, [$10, $11]);
}
export { $0 as Component };
