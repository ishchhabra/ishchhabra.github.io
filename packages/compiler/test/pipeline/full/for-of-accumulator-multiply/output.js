function $0_0($1_0) {
  let $2_0 = 1;
  let $14_phi_19 = undefined;
  $14_phi_19 = $2_0;
  for (const $5_0 of $1_0) {
    $2_0 = $14_phi_19 * $5_0;
    $14_phi_19 = $2_0;
  }
  return $14_phi_19;
}
console.log($0_0(numbers));
