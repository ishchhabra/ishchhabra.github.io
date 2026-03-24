export function Component() {
  const $29_0 = globalThis.getA();
  const $34_0 = globalThis.getB();
  const $3_0 = globalThis.useMemo(() => {
    const $20_0 = $29_0 ? ($34_0 ?? "default") : "fallback";
    return $20_0;
  }, [$29_0, $34_0]);
  return $3_0;
}
