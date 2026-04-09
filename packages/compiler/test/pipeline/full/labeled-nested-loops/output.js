let i = 0;
let $34_phi_43 = undefined;
$34_phi_43 = i;
outer: while ($34_phi_43 < 5) {
  let j = 0;
  let $35_phi_44 = undefined;
  $35_phi_44 = j;
  inner: while ($35_phi_44 < 5) {
    if ($35_phi_44 === 2) {
      j = $35_phi_44 + 1;
      $35_phi_44 = j;
      continue;
    }
    if ($35_phi_44 === 3) {
      i = $34_phi_43 + 1;
      $34_phi_43 = i;
      continue outer;
    }
    if ($34_phi_43 === 4) {
      break outer;
    }
    console.log($34_phi_43, $35_phi_44);
    j = $35_phi_44 + 1;
    $35_phi_44 = j;
  }
  i = $34_phi_43 + 1;
  $34_phi_43 = i;
}
