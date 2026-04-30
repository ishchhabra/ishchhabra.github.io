function $0() {
  while ($1 < $2) {
    const $40 = $3[$1];
    const $39 = $1;
    $1 += 1;
    $3[$39] = undefined;
    globalThis.run($40);
    continue;
  }
}
let $1 = globalThis.i;
let $2 = globalThis.n;
const $3 = globalThis.queued;
export { $0 as flush };
