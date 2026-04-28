const obj = globalThis.obj;
const old = obj.x;
obj.x = globalThis.b;
globalThis.sink((obj.x = old + 1), obj.x);
