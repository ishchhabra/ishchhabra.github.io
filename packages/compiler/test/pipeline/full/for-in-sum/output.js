function $0_0($1_0) {
  let $2_0 = 0;
  let $16_phi_20 = undefined;
  $16_phi_20 = $2_0;
  for (const $5_0 in $1_0) {
    $2_0 = $16_phi_20 + 1;
    $16_phi_20 = $2_0;
  }
  return $16_phi_20;
}
console.log($0_0(myObj));
