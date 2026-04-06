const a = function a() {
  return "b";
};
const b = function b() {
  return 3;
};
let k = {
  b: 1,
};
const p = a();
const v = k[p] + b();
k[p] = v;
const z = v;
