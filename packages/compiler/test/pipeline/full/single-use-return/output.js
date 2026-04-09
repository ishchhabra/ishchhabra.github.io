function $0_0() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  return globalThis.getA() + globalThis.getB();
}
globalThis.getA();
globalThis.getB();
console.log(globalThis.getA() + globalThis.getB());
