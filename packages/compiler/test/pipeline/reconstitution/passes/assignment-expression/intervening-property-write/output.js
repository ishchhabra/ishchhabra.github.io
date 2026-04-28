const $23 = globalThis.obj;
const $24 = $23.x;
$23.x = globalThis.b;
const $25 = $24 + 1;
$23.x = $25;
globalThis.sink($25, $23.x);
