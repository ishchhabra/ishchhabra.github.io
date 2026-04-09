function $0_0($1_0) {
  let result = 1;
  let $14_phi_19 = undefined;
  $14_phi_19 = result;
  for (const item of $1_0) {
    result = $14_phi_19 * item;
    $14_phi_19 = result;
  }
  return $14_phi_19;
}
console.log($0_0(numbers));
