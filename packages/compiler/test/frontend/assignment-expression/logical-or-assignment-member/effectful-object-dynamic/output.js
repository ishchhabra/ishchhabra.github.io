function $0_0() {
  return a;
}
function $1_0() {
  return "b";
}
function $2_0() {
  return 3;
}
let a = {
  b: 0,
};
const $13_0 = $0_0();
const $16_0 = $1_0();
let $19_0 = $13_0[$16_0];
let $31_phi_37 = undefined;
$31_phi_37 = $19_0;
if (!$19_0) {
  const $24_0 = $2_0();
  $13_0[$16_0] = $24_0;
  $19_0 = $24_0;
  $31_phi_37 = $19_0;
}
const result = $31_phi_37;
