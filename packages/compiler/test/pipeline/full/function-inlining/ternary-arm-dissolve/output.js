function $0_0({ x: $2_0, ...$3_0 }) {
  return $3_0;
}
function $1_0($8_0) {
  let $21_phi_31 = $8_0;
  for (const k of [1, 2]) {
    let $22_0 = undefined;
    if (k) {
      const { x: $26_0, ...$28_0 } = $21_phi_31;
      $22_0 = $28_0;
    } else {
      $22_0 = $8_0;
    }
    $21_phi_31 = $22_0;
  }
  return $21_phi_31;
}
export { $1_0 as f };
