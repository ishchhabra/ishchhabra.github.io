function $0() {
  return $1;
}
let $1 = globalThis.x;
globalThis.sink(($1 += 2), $0());
