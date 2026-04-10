function $0_0() {
  const $34_0 = globalThis.getA();
  const $39_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    if ($34_0) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
  return globalThis.useMemo(() => {
    if ($34_0) {
    } else {
    }
    return "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
function $1_0() {
  const $5_0 = globalThis.getA();
  const $6_0 = globalThis.getB();
  return globalThis.useMemo(() => {
    return $5_0 ? ($6_0 ?? "default") : "fallback";
  }, [globalThis.getA(), globalThis.getB()]);
}
export { $0_0 as Component };
