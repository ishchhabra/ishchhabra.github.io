const $1_0 = function $1_0() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.useMemo(() => {
    result = a ? (b ?? "default") : "fallback";
    return result;
  }, [a, b]);
};
export const Component = function Component() {
  const $34_0 = globalThis.getA();
  const $39_0 = globalThis.getB();
  const value = globalThis.useMemo(() => {
    const result = $34_0 ? ($39_0 ?? "default") : "fallback";
    return result;
  }, [$34_0, $39_0]);
  return value;
};
