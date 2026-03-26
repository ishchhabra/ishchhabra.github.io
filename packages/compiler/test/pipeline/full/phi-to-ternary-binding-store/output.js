export function f($1_0) {
  let $19_phi_28 = undefined;
  let $20_phi_29 = $1_0;
  for (const $7_0 of [1, 2]) {
    if ($7_0) {
      const { x: $8_0, ...$9_0 } = $20_phi_29;
      $19_phi_28 = $9_0;
    } else {
      $19_phi_28 = $1_0;
    }
    $20_phi_29 = $19_phi_28;
  }
  return $20_phi_29;
}
