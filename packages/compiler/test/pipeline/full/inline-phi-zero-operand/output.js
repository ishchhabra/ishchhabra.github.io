function $0_0($1_0, $2_0, $3_0) {
  var x = undefined;
  var y = undefined;
  x = undefined;
  y = undefined;
  let $40_phi_55 = undefined;
  let $42_phi_57 = undefined;
  let $44_phi_59 = undefined;
  if ($1_0) {
    let $45_phi_60 = undefined;
    if ($2_0) {
      x = $2_0;
      $15_0 = $2_0;
      $40_phi_55 = x;
      $42_phi_57 = y;
      $45_phi_60 = $15_0;
    } else {
      y = $3_0;
      $15_0 = $3_0;
      $40_phi_55 = x;
      $42_phi_57 = y;
      $45_phi_60 = $15_0;
    }
    $14_0 =
      ($45_phi_60,
      {
        x: $40_phi_55,
        y: $42_phi_57,
      });
    $44_phi_59 = $14_0;
  } else {
    $14_0 = {};
    $44_phi_59 = $14_0;
  }
  return $44_phi_59;
}
console.log($0_0(globalThis.c, globalThis.a, globalThis.b));
