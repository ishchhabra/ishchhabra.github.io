function $0_0($1_0, $2_0, $3_0) {
  let $40_phi_59 = undefined;
  let $42_phi_61 = undefined;
  let $44_phi_63 = undefined;
  if ($1_0) {
    let $45_phi_64 = undefined;
    if ($2_0) {
      $40_phi_59 = $2_0;
      $42_phi_61 = undefined;
      $45_phi_64 = $2_0;
    } else {
      $40_phi_59 = undefined;
      $42_phi_61 = $3_0;
      $45_phi_64 = $3_0;
    }
    $44_phi_63 =
      ($45_phi_64,
      {
        x: $40_phi_59,
        y: $42_phi_61,
      });
  } else {
    $44_phi_63 = {};
  }
  return $44_phi_63;
}
console.log($0_0(globalThis.c, globalThis.a, globalThis.b));
