const a = function a() {
  const g = globalThis.getA();
  const l = globalThis.getB();
  const q = g + l;
  return q;
};
const l = globalThis.getA();
const q = globalThis.getB();
const v = l + q;
console.log(v);
