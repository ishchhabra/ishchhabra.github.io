let d = undefined;
let n = undefined;
if (true) {
  console.log("side effect");
  d = 1;
  n = 1;
} else {
  a = 2;
  n = 2;
}
const l = n;
