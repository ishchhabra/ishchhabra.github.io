function $0($1) {
  const $8 = undefined;
  let blockparam_23 = undefined;
  blockparam_23 = $1;
  let blockparam_24 = undefined;
  for (const $8 of [1, 2]) {
    let blockparam_25 = undefined;
    if ($8) {
      const { x: $11, ...$12 } = blockparam_23;
      blockparam_25 = $12;
    } else {
      blockparam_25 = $1;
    }
    blockparam_23 = blockparam_25;
  }
  return blockparam_24;
}
export { $0 as f };
