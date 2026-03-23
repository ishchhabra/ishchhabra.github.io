export function Component() {
  const $32_0 = globalThis.getA();
  const $37_0 = globalThis.getB();
  const $3_0 = globalThis.useMemo(() => {
    let $49_phi_67 = undefined;
    if ($32_0) {
      const $21_1 = $37_0 ?? "default";
      $49_phi_67 = $37_0 ?? "default";
    } else {
      $49_phi_67 = "fallback";
    }
    return $49_phi_67;
  }, [$32_0, $37_0]);
  return $3_0;
}
function $2_0() {
  const $8_0 = globalThis.getA();
  const $9_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    let $49_phi_67 = undefined;
    if ($8_0) {
      const $21_1 = $9_0 ?? "default";
      $49_phi_67 = $9_0 ?? "default";
      return $49_phi_67;
    } else {
      $49_phi_67 = "fallback";
      return $49_phi_67;
    }
    return $49_phi_67;
  }, [$8_0, $9_0]);
}
