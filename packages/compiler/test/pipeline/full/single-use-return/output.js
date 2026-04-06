const a = function a() {
  const g = globalThis.getA();
  const l = globalThis.getB();
  const q = g + l;
  return q;
};
const k = globalThis.getA();
const p = globalThis.getB();
const u = k + p;
console.log(u);
