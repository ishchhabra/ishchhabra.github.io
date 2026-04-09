function $0_0($1_0) {
  let count = 0;
  let $15_phi_19 = undefined;
  $15_phi_19 = count;
  for (const key in $1_0) {
    count = $15_phi_19 + 1;
    $15_phi_19 = count;
  }
  return $15_phi_19;
}
console.log($0_0(myObj));
