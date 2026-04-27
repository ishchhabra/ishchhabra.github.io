function $0() {
  console.log("rhs");
  return 1;
}
const $21 = globalThis.a;
let $13;
if ($21) {
  $13 = $21;
} else {
  $13 = $0();
}
console.log($13);
