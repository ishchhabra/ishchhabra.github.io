export function Component() {
  const $28_0 = globalThis.getA();
  const $33_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    const $19_0 = $28_0 ? ($33_0 ?? "default") : "fallback";
    return $19_0;
  }, [$28_0, $33_0]);
  return $2_0;
}
