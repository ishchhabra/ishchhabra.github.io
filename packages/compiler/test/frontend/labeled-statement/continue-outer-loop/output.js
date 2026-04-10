let $0_0 = 0;
let $30_phi_37 = undefined;
$30_phi_37 = $0_0;
outer: while ($30_phi_37 < 3) {
  let $5_0 = 0;
  let $31_phi_38 = undefined;
  $31_phi_38 = $5_0;
  let $32_phi_39 = undefined;
  while ($31_phi_38 < 3) {
    if ($31_phi_38 === 1) {
      const $23_0 = $30_phi_37;
      $0_0 = $30_phi_37 + 1;
      $30_phi_37;
      $30_phi_37 = $0_0;
      $32_phi_39 = $31_phi_38;
      continue outer;
    }
    console.log($30_phi_37, $31_phi_38);
    const $16_0 = $31_phi_38;
    $5_0 = $31_phi_38 + 1;
    $31_phi_38;
    $31_phi_38 = $5_0;
  }
  const $23_0 = $30_phi_37;
  $0_0 = $30_phi_37 + 1;
  $30_phi_37;
  $30_phi_37 = $0_0;
  $32_phi_39 = $31_phi_38;
}
