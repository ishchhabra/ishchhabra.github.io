const a = function a() {
  return "b";
};
const b = function b() {
  return 3;
};
let e = {
  b: 1,
};
const $14_0 = a();
const $19_0 = e[$14_0] + b();
e[$14_0] = $19_0;
const f = $19_0;
