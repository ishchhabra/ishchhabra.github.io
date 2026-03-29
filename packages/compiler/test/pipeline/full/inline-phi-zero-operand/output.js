function $0_0($1_0, $2_0, $3_0) {
  let $36_phi_62 = undefined;
  let $38_phi_64 = undefined;
  let $40_phi_66 = undefined;
  if ($1_0) {
    let $41_phi_67 = undefined;
    if ($2_0) {
      $36_phi_62 = $2_0;
      $38_phi_64 = undefined;
      $41_phi_67 = $2_0;
    } else {
      $36_phi_62 = undefined;
      $38_phi_64 = $3_0;
      $41_phi_67 = $3_0;
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
