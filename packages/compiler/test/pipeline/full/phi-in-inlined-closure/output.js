function $0() {
  return $1();
}
function $1() {
  const $8 = globalThis.getA();
  const $9 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $24;
    let $29;
    if ($8) {
      const $45 = $9;
      if ($45 != null) {
        $29 = $45;
      } else {
        $29 = "default";
      }
      $24 = $29;
    } else {
      $24 = "fallback";
    }
    return $24;
  }, [$8, $9]);
}
export { $0 as Component };
