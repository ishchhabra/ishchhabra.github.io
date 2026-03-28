let $34_phi_45 = 0;
outer: while ($34_phi_45 < 5) {
  const $5_0 = 0;
  let $35_phi_46 = $5_0;
  let $36_phi_47 = undefined;
  let $37_phi_48 = undefined;
  inner: while ($35_phi_46 < 5) {
    if ($35_phi_46 === 2) {
      const $20_0 = $35_phi_46;
      $20_0;
      $35_phi_46 = $35_phi_46 + 1;
      continue;
    }
    if ($35_phi_46 === 3) {
      const $27_0 = $34_phi_45;
      $27_0;
      $34_phi_45 = $34_phi_45 + 1;
      $36_phi_47 = $35_phi_46;
      continue outer;
    }
    if ($34_phi_45 === 4) {
      $37_phi_48 = $5_0;
      break outer;
    }
    console.log($34_phi_45, $35_phi_46);
    const $20_0 = $35_phi_46;
    $20_0;
    $35_phi_46 = $35_phi_46 + 1;
  }
  const $27_0 = $34_phi_45;
  $27_0;
  $34_phi_45 = $34_phi_45 + 1;
  $36_phi_47 = $35_phi_46;
}
