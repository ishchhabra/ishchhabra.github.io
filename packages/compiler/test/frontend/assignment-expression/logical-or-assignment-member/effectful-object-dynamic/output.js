function $0() {
  return $3;
}
function $1() {
  return "b";
}
function $2() {
  return 3;
}
let $3 = {
  b: 0,
};
const $16 = $0();
const $20 = $1();
let $29 = undefined;
if (!$16[$20]) {
  const $26 = $2();
  $16[$20] = $26;
  $29 = $26;
} else {
  $29 = $16[$20];
}
const $4 = $29;
