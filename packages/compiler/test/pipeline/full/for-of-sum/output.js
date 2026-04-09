function $0_0($1_0) {
  let total = 0;
  let $14_phi_19 = undefined;
  $14_phi_19 = total;
  for (const item of $1_0) {
    total = $14_phi_19 + item;
    $14_phi_19 = total;
  }
  return $14_phi_19;
}
console.log($0_0(numbers));
