let $0_0 = 0;
let $34_phi_43 = undefined;
$34_phi_43 = $0_0;
outer: while ($34_phi_43 < 5) {
  let $5_0 = 0;
  let $35_phi_44 = undefined;
  $35_phi_44 = $5_0;
  inner: while ($35_phi_44 < 5) {
    if ($35_phi_44 === 2) {
      $5_0 = $35_phi_44 + 1;
      $35_phi_44 = $5_0;
      continue;
    }
    if ($35_phi_44 === 3) {
      $0_0 = $34_phi_43 + 1;
      $34_phi_43 = $0_0;
      continue outer;
    }
    if ($34_phi_43 === 4) {
      break outer;
    }
    console.log($34_phi_43, $35_phi_44);
    $5_0 = $35_phi_44 + 1;
    $35_phi_44 = $5_0;
  }
  $0_0 = $34_phi_43 + 1;
  $34_phi_43 = $0_0;
}
