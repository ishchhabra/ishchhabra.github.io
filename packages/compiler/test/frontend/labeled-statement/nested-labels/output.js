let $34_phi_45 = 0;
outer: while ($34_phi_45 < 5) {
  let $35_phi_46 = 0;
  let $36_phi_47 = undefined;
  let $37_phi_48 = undefined;
  inner: while ($35_phi_46 < 5) {
    if ($35_phi_46 === 2) {
      $35_phi_46 = $35_phi_46 + 1;
      continue;
    }
    if ($35_phi_46 === 3) {
      $34_phi_45 = $34_phi_45 + 1;
      $36_phi_47 = $35_phi_46;
      continue outer;
    }
    if ($34_phi_45 === 4) {
      $37_phi_48 = 0;
      break outer;
    }
    console.log($34_phi_45, $35_phi_46);
    $35_phi_46 = $35_phi_46 + 1;
  }
  $34_phi_45 = $34_phi_45 + 1;
  $36_phi_47 = $35_phi_46;
}
