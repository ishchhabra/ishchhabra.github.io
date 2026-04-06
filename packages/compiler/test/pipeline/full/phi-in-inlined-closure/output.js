const b = function b() {
  const f = globalThis.getA();
  const k = globalThis.getB();
  return globalThis.useMemo(() => {
    n = f ? (k ?? "default") : "fallback";
    return n;
  }, [f, k]);
};
export const Component = function Component() {
  const j = globalThis.getA();
  const o = globalThis.getB();
  const d = globalThis.useMemo(() => {
    const n = j ? (o ?? "default") : "fallback";
    return n;
  }, [j, o]);
  return d;
};
