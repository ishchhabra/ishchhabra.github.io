function $0() {
  return $1();
}
function $1() {
  const $8 = globalThis.getA();
  const $9 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $24;
    if ($8) {
      const $44 = $9 != null ? $9 : "default";
      $24 = $44;
    } else {
      $24 = "fallback";
    }
    return $24;
  }, [$8, $9]);
}
export { $0 as Component };
