function $0({ x: $2, ...$3 }) {
  return $3;
}
function $1($8) {
  let blockparam_30 = undefined;
  blockparam_30 = $8;
  let blockparam_31 = undefined;
  for (const $15 of [1, 2]) {
    let blockparam_32 = undefined;
    if ($15) {
      const $44 = $0(blockparam_30);
      blockparam_32 = $44;
    } else {
      blockparam_32 = $8;
    }
    blockparam_30 = blockparam_32;
    blockparam_31 = blockparam_32;
  }
  return blockparam_31;
}
export { $1 as f };
