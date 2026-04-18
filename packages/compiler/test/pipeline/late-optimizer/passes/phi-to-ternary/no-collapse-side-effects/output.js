let $0 = undefined;
let $16 = undefined;
if (true) {
  console.log("side effect");
  $0 = 1;
  $16 = $0;
} else {
  $0 = 2;
  $16 = $0;
}
const $1 = $16;
