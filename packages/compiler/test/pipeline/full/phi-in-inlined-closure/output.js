function $1_0() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.useMemo(() => {
    const result = a ? (b ?? "default") : "fallback";
    return result;
  }, [a, b]);
}
export function Component() {
  const $32_0 = globalThis.getA();
  const $37_0 = globalThis.getB();
  const value = globalThis.useMemo(() => {
    const result = $32_0 ? ($37_0 ?? "default") : "fallback";
    return result;
  }, [$32_0, $37_0]);
  return value;
}
