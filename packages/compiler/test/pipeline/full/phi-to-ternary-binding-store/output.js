function $0_0($1_0) {
  let $2_0 = $1_0;
  let $23_blockparam_23 = undefined;
  $23_blockparam_23 = $2_0;
  let $24_blockparam_24 = undefined;
  for (const $8_0 of [1, 2]) {
    let $25_0 = undefined;
    if ($8_0) {
      const { x: $11_0, ...$12_0 } = $23_blockparam_23;
      $2_0 = $12_0;
      $25_0 = $2_0;
    } else {
      $2_0 = $1_0;
      $25_0 = $2_0;
    }
    $23_blockparam_23 = $25_0;
    $24_blockparam_24 = $25_0;
  }
  return $24_blockparam_24;
}
export { $0_0 as f };
