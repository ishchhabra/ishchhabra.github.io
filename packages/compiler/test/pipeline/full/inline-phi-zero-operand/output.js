function $0_0($1_0, $2_0, $3_0) {
  let $40_phi_60 = undefined;
  let $42_phi_62 = undefined;
  let $44_phi_64 = undefined;
  if ($1_0) {
    let $45_phi_65 = undefined;
    if ($2_0) {
      $40_phi_60 = $2_0;
      $42_phi_62 = undefined;
      $45_phi_65 = $2_0;
    } else {
      $40_phi_60 = undefined;
      $42_phi_62 = $3_0;
      $45_phi_65 = $3_0;
    }
    $44_phi_64 =
      ($45_phi_65,
      {
        x: $40_phi_60,
        y: $42_phi_62,
      });
  } else {
    $44_phi_64 = {};
  }
  return $44_phi_64;
}
console.log($0_0(globalThis.c, globalThis.a, globalThis.b));
