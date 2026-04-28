let value = globalThis.x;
function read() {
  return value;
}
globalThis.sink((value += 2), read());
