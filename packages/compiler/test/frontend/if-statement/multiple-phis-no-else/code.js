let x = 0;
let y = 0;
if (globalThis.cond) {
  x = globalThis.a();
  y = globalThis.b();
}
console.log(x, y);
