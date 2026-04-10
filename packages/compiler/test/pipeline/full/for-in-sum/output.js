function $0_0($1_0) {
  let $2_0 = 0;
  let $15_phi_19 = undefined;
  $15_phi_19 = $2_0;
  for (const $5_0 in $1_0) {
    $2_0 = $15_phi_19 + 1;
    $15_phi_19 = $2_0;
  }
  return $15_phi_19;
}
console.log($0_0(myObj));
