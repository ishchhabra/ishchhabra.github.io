function $0() {
  return $1;
}
let $1 = globalThis.x;
$1 = 2 + $1;
globalThis.sink($1, $0());
