export function Component() {
  const $31_0 = globalThis.getA();
  const $36_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    return $31_0 ? ($36_0 ?? "default") : "fallback";
  }, [$31_0, $36_0]);
  return $2_0;
}
