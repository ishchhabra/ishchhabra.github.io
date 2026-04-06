const a = function a({ x: a, ...b }) {
  return b;
};
export const f = function f(a) {
  let $23_phi_35 = a;
  for (const b of [1, 2]) {
    let $24_0 = undefined;
    if (b) {
      const { x: $28_0, ...$30_0 } = $23_phi_35;
      $24_0 = $30_0;
    } else {
      $24_0 = a;
    }
    $23_phi_35 = $24_0;
  }
  return $23_phi_35;
};
