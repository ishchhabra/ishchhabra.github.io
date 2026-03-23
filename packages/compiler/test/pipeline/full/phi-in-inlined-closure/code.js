// Component is declared first, so its FunctionIR is registered before
// useHook's children. When the pipeline processes Component and inlines
// useHook, the useMemo callback's FunctionIR hasn't been pipeline-processed
// yet, so the clone gets blocks without phi elimination.
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
