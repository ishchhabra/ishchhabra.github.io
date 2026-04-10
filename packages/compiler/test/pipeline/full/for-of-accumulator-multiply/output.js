function $0_0($1_0) {
  let $2_0 = 1;
  let $15_phi_20 = undefined;
  $15_phi_20 = $2_0;
  for (const $5_0 of $1_0) {
    $2_0 = $15_phi_20 * $5_0;
    $15_phi_20 = $2_0;
  }
  return $15_phi_20;
}
console.log($0_0(numbers));
