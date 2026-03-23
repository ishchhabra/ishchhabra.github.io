export function Component() {
  const $32_0 = globalThis.getA();
  const $37_0 = globalThis.getB();
  const $3_0 = globalThis.useMemo(() => {
    return $32_0 ? ($37_0 ?? "default") : "fallback";
  }, [$32_0, $37_0]);
  return $3_0;
}
function $2_0() {
  const $8_0 = globalThis.getA();
  const $9_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    return $8_0 ? ($9_0 ?? "default") : "fallback";
  }, [$8_0, $9_0]);
}
