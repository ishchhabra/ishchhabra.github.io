let a = globalThis.x;
let b = globalThis.y;
if (globalThis.cond) {
  let tmp = a;
  a = b;
  b = tmp;
}
console.log(a, b);
