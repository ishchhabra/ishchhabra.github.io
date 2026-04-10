function $0_0({ x: $2_0, ...$3_0 }) {
  return $3_0;
}
function $1_0($8_0) {
  let $9_0 = $8_0;
  let $21_phi_29 = undefined;
  $21_phi_29 = $9_0;
  for (const $14_0 of [1, 2]) {
    let $22_0 = undefined;
    if ($14_0) {
      const { x: $24_0, ...$25_0 } = $21_phi_29;
      $22_0 = $25_0;
    } else {
      $22_0 = $8_0;
    }
    $21_phi_29 = $22_0;
  }
  return $21_phi_29;
}
export { $1_0 as f };
