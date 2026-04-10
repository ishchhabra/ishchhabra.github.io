let $0_0 = 0;
let $31_phi_40 = undefined;
$31_phi_40 = $0_0;
outer: while ($31_phi_40 < 5) {
  let $5_0 = 0;
  let $32_phi_41 = undefined;
  $32_phi_41 = $5_0;
  let $33_phi_42 = undefined;
  let $34_phi_43 = undefined;
  inner: while ($32_phi_41 < 5) {
    if ($32_phi_41 === 2) {
      const $19_0 = $32_phi_41;
      $5_0 = $32_phi_41 + 1;
      $32_phi_41 = $5_0;
      continue;
    }
    if ($32_phi_41 === 3) {
      const $25_0 = $31_phi_40;
      $0_0 = $31_phi_40 + 1;
      $31_phi_40 = $0_0;
      $33_phi_42 = $32_phi_41;
      continue outer;
    }
    if ($31_phi_40 === 4) {
      $34_phi_43 = $32_phi_41;
      break outer;
    }
    console.log($31_phi_40, $32_phi_41);
    const $19_0 = $32_phi_41;
    $5_0 = $32_phi_41 + 1;
    $32_phi_41 = $5_0;
  }
  const $25_0 = $31_phi_40;
  $0_0 = $31_phi_40 + 1;
  $31_phi_40 = $0_0;
  $33_phi_42 = $32_phi_41;
}
