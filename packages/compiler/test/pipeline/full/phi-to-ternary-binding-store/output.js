function $0_0($1_0) {
  let $19_phi_27 = undefined;
  let $20_phi_28 = $1_0;
  for (const k of [1, 2]) {
    if (k) {
      const { x: x, ...rest } = $20_phi_28;
      $19_phi_27 = rest;
    } else {
      $19_phi_27 = $1_0;
    }
    $20_phi_28 = $19_phi_27;
  }
  return $20_phi_28;
}
export { $0_0 as f };
