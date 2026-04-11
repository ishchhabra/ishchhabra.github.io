// Regression test: inlining a callee whose nested closure contains a
// ternary (phi diamond). CGSCC-ordered processing ensures the closure
// is fully optimized before the caller clones it during inlining.
export function Component() {
  const value = useHook();
  return value;
}
function useHook() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.useMemo(() => {
    const result = a ? (b ?? "default") : "fallback";
    return result;
  }, [a, b]);
}
