const a = function a(a, b, c) {
  let $41_phi_61 = undefined;
  let $43_phi_63 = undefined;
  let $45_phi_65 = undefined;
  if (a) {
    let $46_phi_66 = undefined;
    if (b) {
      $41_phi_61 = b;
      $43_phi_63 = undefined;
      $46_phi_66 = b;
    } else {
      $41_phi_61 = undefined;
      $43_phi_63 = c;
      $46_phi_66 = c;
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
console.log(a(globalThis.c, globalThis.a, globalThis.b));
