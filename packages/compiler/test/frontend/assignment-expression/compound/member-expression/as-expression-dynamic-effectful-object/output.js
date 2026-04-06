const a = function a() {
  return f;
};
const b = function b() {
  return "b";
};
const c = function c() {
  return 3;
};
let f = {
  b: 1,
};
const $16_0 = a();
const $19_0 = b();
const $24_0 = $16_0[$19_0] + c();
$16_0[$19_0] = $24_0;
const g = $24_0;
