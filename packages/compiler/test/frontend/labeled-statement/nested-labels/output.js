let i = 0;
let $34_phi_43 = undefined;
$34_phi_43 = i;
outer: while ($34_phi_43 < 5) {
  let j = 0;
  let $35_phi_44 = undefined;
  $35_phi_44 = j;
  let $36_phi_45 = undefined;
  let $37_phi_46 = undefined;
  inner: while ($35_phi_44 < 5) {
    if ($35_phi_44 === 2) {
      const $20_0 = $35_phi_44;
      j = $35_phi_44 + 1;
      $35_phi_44;
      $35_phi_44 = j;
      continue;
    }
    if ($35_phi_44 === 3) {
      const $27_0 = $34_phi_43;
      i = $34_phi_43 + 1;
      $34_phi_43;
      $34_phi_43 = i;
      $36_phi_45 = $35_phi_44;
      continue outer;
    }
    if ($34_phi_43 === 4) {
      $37_phi_46 = $35_phi_44;
      break outer;
    }
    console.log($34_phi_43, $35_phi_44);
    const $20_0 = $35_phi_44;
    j = $35_phi_44 + 1;
    $35_phi_44;
    $35_phi_44 = j;
  }
  const $27_0 = $34_phi_43;
  i = $34_phi_43 + 1;
  $34_phi_43;
  $34_phi_43 = i;
  $36_phi_45 = $35_phi_44;
}
