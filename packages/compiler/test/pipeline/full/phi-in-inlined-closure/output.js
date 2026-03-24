export function Component() {
  const $32_0 = globalThis.getA();
  const $37_0 = globalThis.getB();
  const $3_0 = globalThis.useMemo(() => {
    const $20_0 = $32_0 ? ($37_0 ?? "default") : "fallback";
    return $20_0;
  }, [$32_0, $37_0]);
  return $3_0;
}
