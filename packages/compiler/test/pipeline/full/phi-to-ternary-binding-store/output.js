export const f = function f(a) {
  let $20_phi_29 = undefined;
  let $21_phi_30 = a;
  for (const b of [1, 2]) {
    if (b) {
      const { x: c, ...d } = $21_phi_30;
      $20_phi_29 = d;
    } else {
      $20_phi_29 = a;
    }
    $21_phi_30 = $20_phi_29;
  }
  return $21_phi_30;
};
