export function Component() {
  const $28_0 = globalThis.getA();
  const $33_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    return $28_0 ? ($33_0 ?? "default") : "fallback";
  }, [$28_0, $33_0]);
  return $2_0;
}
