const x = globalThis.a;
const y = globalThis.b;
let result;
if (x > y) {
  result = x + y;
} else {
  result = x - y;
}
console.log(result);
