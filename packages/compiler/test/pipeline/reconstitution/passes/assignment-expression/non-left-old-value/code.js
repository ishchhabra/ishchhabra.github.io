let value = globalThis.x;
function read() {
  return value;
}
value = 2 + value;
globalThis.sink(value, read());
