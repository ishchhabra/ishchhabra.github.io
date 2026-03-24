const x = globalThis.x;
let result;
if (x > 0) {
  result = "positive";
} else if (x < 0) {
  result = "negative";
} else {
  result = "zero";
}
console.log(result);
