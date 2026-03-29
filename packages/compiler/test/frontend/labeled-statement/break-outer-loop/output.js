let $30_phi_39 = 0;
outer: while ($30_phi_39 < 3) {
  let $31_phi_40 = 0;
  let $32_phi_41 = undefined;
  let $33_phi_42 = undefined;
  while ($31_phi_40 < 3) {
    if ($31_phi_40 === 1) {
      $33_phi_42 = 0;
      break outer;
    }
    console.log($30_phi_39, $31_phi_40);
    $31_phi_40 = $31_phi_40 + 1;
  }
  $30_phi_39 = $30_phi_39 + 1;
  $32_phi_41 = 0;
}
