function $0_0({ x: $2_0, ...$3_0 }) {
  return $3_0;
}
function $1_0($8_0) {
  let $9_0 = $8_0;
  let $29_blockparam_30 = undefined;
  $29_blockparam_30 = $9_0;
  let $30_blockparam_31 = undefined;
  for (const $15_0 of [1, 2]) {
    let $31_0 = undefined;
    if ($15_0) {
      $9_0 = $0_0($29_blockparam_30);
      $31_0 = $9_0;
    } else {
      $9_0 = $8_0;
      $31_0 = $9_0;
    }
    $29_blockparam_30 = $31_0;
    $30_blockparam_31 = $31_0;
  }
  return $30_blockparam_31;
}
export { $1_0 as f };
