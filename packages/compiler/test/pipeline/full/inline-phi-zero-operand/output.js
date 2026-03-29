function $0_0($1_0, $2_0, $3_0) {
  const $4_2 = undefined;
  const $7_2 = undefined;
  let $36_phi_62 = undefined;
  let $38_phi_64 = undefined;
  let $40_phi_66 = undefined;
  if ($1_0) {
    let $41_phi_67 = undefined;
    if ($2_0) {
      const $4_3 = $2_0;
      $36_phi_62 = $4_3;
      $38_phi_64 = $7_2;
      $41_phi_67 = $4_3;
    } else {
      const $7_3 = $3_0;
      $36_phi_62 = $4_2;
      $38_phi_64 = $7_3;
      $41_phi_67 = $7_3;
    }
    $40_phi_66 =
      ($41_phi_67,
      {
        x: $36_phi_62,
        y: $38_phi_64,
      });
  } else {
    $40_phi_66 = {};
  }
  return $40_phi_66;
}
console.log($0_0(globalThis.c, globalThis.a, globalThis.b));
