const $0_0 = function $0_0($1_0, $2_0, $3_0) {
  let $41_phi_61 = undefined;
  let $43_phi_63 = undefined;
  let $45_phi_65 = undefined;
  if ($1_0) {
    let $46_phi_66 = undefined;
    if ($2_0) {
      $41_phi_61 = $2_0;
      $43_phi_63 = undefined;
      $46_phi_66 = $2_0;
    } else {
      $41_phi_61 = undefined;
      $43_phi_63 = $3_0;
      $46_phi_66 = $3_0;
    }
    $45_phi_65 =
      ($46_phi_66,
      {
        x: $41_phi_61,
        y: $43_phi_63,
      });
  } else {
    $45_phi_65 = {};
  }
  return $45_phi_65;
};
console.log($0_0(globalThis.c, globalThis.a, globalThis.b));
