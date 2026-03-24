function compute() {
  const a = globalThis.getA();
  const b = globalThis.getB();
  const result = a + b;
  return result;
}
console.log(compute());
