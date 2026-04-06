const b = function b() {
  const c = globalThis.getA();
  const d = globalThis.getB();
  return globalThis.useMemo(() => {
    b = c ? (d ?? "default") : "fallback";
    return b;
  }, [c, d]);
};
export const Component = function Component() {
  const $34_0 = globalThis.getA();
  const $39_0 = globalThis.getB();
  const b = globalThis.useMemo(() => {
    const b = $34_0 ? ($39_0 ?? "default") : "fallback";
    return b;
  }, [$34_0, $39_0]);
  return b;
};
