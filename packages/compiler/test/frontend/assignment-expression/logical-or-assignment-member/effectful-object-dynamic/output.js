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
  b: 0,
};
const $16_0 = a();
const $19_0 = b();
let $22_0 = $16_0[$19_0];
let $34_phi_43 = undefined;
$34_phi_43 = $22_0;
if (!$22_0) {
  const $27_0 = c();
  $16_0[$19_0] = $27_0;
  $22_1 = $27_0;
  $34_phi_43 = $22_1;
}
const g = $34_phi_43;
