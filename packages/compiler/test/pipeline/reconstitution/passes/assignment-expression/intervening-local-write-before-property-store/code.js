const obj = globalThis.obj;
let y = globalThis.y;
function readY() {
  return y;
}
const old = obj.x;
y += globalThis.step;
globalThis.sink((obj.x = old + 1), readY());
