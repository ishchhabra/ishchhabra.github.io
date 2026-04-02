export function Component() {
  const $33_0 = globalThis.getA();
  const $38_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    return $33_0 ? ($38_0 ?? "default") : "fallback";
  }, [$33_0, $38_0]);
  return $2_0;
}
