const x = 1;
const y = x;
let result;
if (globalThis.flag) {
  result = y;
} else {
  result = 2;
}
console.log(result);
