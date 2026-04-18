function $0({ x: $2, ...$3 }) {
  return $3;
}
function $1($8) {
  let $9 = $8;
  let blockparam_30 = undefined;
  blockparam_30 = $9;
  let blockparam_31 = undefined;
  for (const $15 of [1, 2]) {
    let $32 = undefined;
    if ($15) {
      $9 = $0(blockparam_30);
      $32 = $9;
    } else {
      $9 = $8;
      $32 = $9;
    }
    blockparam_30 = $32;
    blockparam_31 = $32;
  }
  return blockparam_31;
}
export { $1 as f };
