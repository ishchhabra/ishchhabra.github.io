function $0() {
  return $1();
}
function $1() {
  const $8 = globalThis.getA();
  const $9 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $30 = undefined;
    if ($8) {
      const $49 = $9;
      let $28 = undefined;
      $30 = $49 != null ? $49 : "default";
    } else {
      $30 = "fallback";
    }
    return $30;
  }, [$8, $9]);
}
export { $0 as Component };
