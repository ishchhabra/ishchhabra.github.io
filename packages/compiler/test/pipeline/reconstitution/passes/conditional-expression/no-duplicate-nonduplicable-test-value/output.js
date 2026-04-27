const $33 = sessionStorage.getItem("k");
let $12;
let $18;
if ($33) {
  $12 = $33;
} else {
  $12 = "{}";
}
if ($33) {
  $18 = $33 + "!";
} else {
  $18 = "missing";
}
console.log(JSON.parse($12), $18);
