if (true) {
  console.log("first");
}
let $0 = 10;
let $16 = undefined;
if (true) {
  $0 = 20;
  $16 = $0;
} else {
  $16 = $0;
  $16 = $0;
}
console.log($16);
