let $0_0 = 0;
let $27_phi_34 = undefined;
$27_phi_34 = $0_0;
outer: while ($27_phi_34 < 3) {
  let $5_0 = 0;
  let $28_phi_35 = undefined;
  $28_phi_35 = $5_0;
  while ($28_phi_35 < 3) {
    if ($28_phi_35 === 1) {
      $0_0 = $27_phi_34 + 1;
      $27_phi_34 = $0_0;
      continue outer;
    }
    console.log($27_phi_34, $28_phi_35);
    $5_0 = $28_phi_35 + 1;
    $28_phi_35 = $5_0;
  }
  $0_0 = $27_phi_34 + 1;
  $27_phi_34 = $0_0;
}
