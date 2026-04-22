function $0() {
  return $1();
}
function $1() {
  const $8 = globalThis.getA();
  const $9 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $23 = undefined;
    let $28 = undefined;
    if ($8) {
      const $49 = $9;
      if ($49 != null) {
        $28 = $49;
      } else {
        $28 = "default";
      }
      $23 = $28;
    } else {
      $23 = "fallback";
    }
    return $23;
  }, [$8, $9]);
}
export { $0 as Component };
