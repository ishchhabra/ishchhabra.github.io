export const Component = function Component() {
  const $35_0 = globalThis.getA();
  const $40_0 = globalThis.getB();
  const $2_0 = globalThis.useMemo(() => {
    return $35_0 ? ($40_0 ?? "default") : "fallback";
  }, [$35_0, $40_0]);
  return $2_0;
};
