const a = function a() {
  return m;
};
const b = function b() {
  return "b";
};
const c = function c() {
  return 3;
};
let m = {
  b: 1,
};
const q = a();
const u = b();
const A = q[u] + c();
q[u] = A;
const E = A;
