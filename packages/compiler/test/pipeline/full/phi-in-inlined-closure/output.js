export function Component() {
  const $32_0 = globalThis.getA();
  const $37_0 = globalThis.getB();
  const $3_0 = globalThis.useMemo(() => {
    const $21_1 = $37_0 ?? "default";
    const $21_2 = "fallback";
    const $49_phi_67 = $32_0 ? $21_1 : $21_2;
    return $49_phi_67;
  }, [$32_0, $37_0]);
  return $3_0;
}
function $2_0() {
  const $8_0 = globalThis.getA();
  const $9_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    const $21_1 = $9_0 ?? "default";
    const $21_2 = "fallback";
    const $49_phi_67 = $8_0 ? $21_1 : $21_2;
    return $49_phi_67;
  }, [$8_0, $9_0]);
}
