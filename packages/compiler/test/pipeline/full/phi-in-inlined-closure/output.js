function $1_0() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.useMemo(() => {
    return a ? (b ?? "default") : "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
export function Component() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  const value = globalThis.useMemo(() => {
    if (a) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
  return globalThis.useMemo(() => {
    if (a) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
