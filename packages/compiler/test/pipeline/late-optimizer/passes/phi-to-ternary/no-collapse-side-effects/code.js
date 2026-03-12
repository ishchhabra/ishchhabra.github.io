let x;
if (true) {
  console.log("side effect");
  x = 1;
} else {
  x = 2;
}
const y = x;
