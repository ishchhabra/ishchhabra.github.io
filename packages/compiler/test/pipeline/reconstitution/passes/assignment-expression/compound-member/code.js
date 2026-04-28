const obj = globalThis.obj;
globalThis.sink((obj.count += 3), obj.count);
