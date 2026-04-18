function $0($1) {
  let $2 = $1;
  let blockparam_23 = undefined;
  blockparam_23 = $2;
  let blockparam_24 = undefined;
  for (const $8 of [1, 2]) {
    let $25 = undefined;
    if ($8) {
      const { x: $11, ...$12 } = blockparam_23;
      $2 = $12;
      $25 = $2;
    } else {
      $2 = $1;
      $25 = $2;
    }
    blockparam_23 = $25;
    blockparam_24 = $25;
  }
  return blockparam_24;
}
export { $0 as f };
