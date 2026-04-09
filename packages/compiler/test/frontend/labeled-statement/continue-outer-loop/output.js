let i = 0;
let $30_phi_37 = undefined;
$30_phi_37 = i;
outer: while ($30_phi_37 < 3) {
  let j = 0;
  let $31_phi_38 = undefined;
  $31_phi_38 = j;
  let $32_phi_39 = undefined;
  while ($31_phi_38 < 3) {
    if ($31_phi_38 === 1) {
      const $23_0 = $30_phi_37;
      i = $30_phi_37 + 1;
      $30_phi_37;
      $30_phi_37 = i;
      $32_phi_39 = $31_phi_38;
      continue outer;
    }
    console.log($30_phi_37, $31_phi_38);
    const $16_0 = $31_phi_38;
    j = $31_phi_38 + 1;
    $31_phi_38;
    $31_phi_38 = j;
  }
  const $23_0 = $30_phi_37;
  i = $30_phi_37 + 1;
  $30_phi_37;
  $30_phi_37 = i;
  $32_phi_39 = $31_phi_38;
}
