export const f = function f($1_0) {
  let $20_phi_29 = undefined;
  let $21_phi_30 = $1_0;
  for (const k of [1, 2]) {
    if (k) {
      const { x: x, ...rest } = $21_phi_30;
      $20_phi_29 = rest;
    } else {
      $20_phi_29 = $1_0;
    }
    $21_phi_30 = $20_phi_29;
  }
  return $21_phi_30;
};
