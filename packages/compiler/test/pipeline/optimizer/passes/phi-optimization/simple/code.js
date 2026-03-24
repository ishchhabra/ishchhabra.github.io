const x = globalThis.x;
const y = globalThis.y;
let result;
if (x > y) {
  result = x + y;
} else {
  result = x - y;
}
console.log(result);
