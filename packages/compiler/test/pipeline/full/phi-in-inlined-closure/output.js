function $1_0() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.useMemo(() => {
    return a ? (b ?? "default") : "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
export function Component() {
  const $33_0 = globalThis.getA();
  const $38_0 = globalThis.getB();
  const value = globalThis.useMemo(() => {
    if ($33_0) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
  return globalThis.useMemo(() => {
    if ($33_0) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
